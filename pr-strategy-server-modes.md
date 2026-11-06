# PR 方案：让用户自选「服务器连接模式」

> 状态：**草案，待用户确认后提交**
> 目标仓库：`liguobao/ds-harness-remote`（upstream）
> 我们的基线：fork 分支 `fork-stability-patches`（含已完成并验证的自部署代码）

---

## 一、目标（用户价值）

当前插件只有一种连接方式：**官方服务器 `dsh.r2049.cn`**（`serverUrl` 可覆盖）。
我们新增**用户可选的三模式**，让用户自己决定服务器来源：

| 模式 | 适用人群 | 实现 |
|---|---|---|
| **A. 官方服务器**（默认，不变）| 大多数用户 | `serverUrl` 留空 → `dsh.r2049.cn` |
| **B. 自部署服务器（局域网/自有域名）** | 想摆脱第三方服务器、有自家域名的用户 | 新增 `selfHost`：插件内置启动开源 Server（`@dsh-remote/server`），可选 Cloudflare Tunnel 暴露到公网 |
| **C. 自定义服务器地址** | 已有 VPS/反向代理的用户 | `serverUrl` 填任意 HTTPS origin（现有能力）|

> 覆盖我们讨论过的场景：官方 / 自建（含 Tunnel）/ 自定义。Tailscale 等方案不属于服务器模式，不纳入本 PR（文档给指引即可）。

---

## 二、配置设计（schemastery 自动渲染到 DSH 设置页）

```yaml
# 默认值 = 现在的行为，完全不变
serverUrl: ''          # 留空 = 官方服务器；填 = 自定义（C）

# 新增：内置自部署服务器（B）
selfHost:
  enabled: false       # 默认关闭（opt-in）
  port: 8081
  account: ''          # 必填（≥1 字符）
  password: ''         # 必填（≥12 字符）
  publicUrl: ''        # 可选：外网访问用的 HTTPS 域名（留空 = 局域网 IP）
  tunnel:
    mode: 'off'        # off | named
    token: ''          # Cloudflare Tunnel token（named 模式）
    configPath: ''     # 可选：本地 cloudflared config.yml（token 模式不可用时的替代）
```

**行为规则**：
- `selfHost.enabled=false` + `serverUrl` 留空 → **官方**（现状）
- `selfHost.enabled=false` + `serverUrl` 有值 → **自定义服务器**
- `selfHost.enabled=true` → 插件启动内置 Server（`0.0.0.0:port`），Host 连它；
  - `publicUrl` 留空 → 局域网 IP（同一 WiFi 可用）
  - `publicUrl` 填 HTTPS 域名 + `tunnel.mode=named` → 插件托管 cloudflared 隧道，手机 5G 可访问
  - `selfHost` 优先于 `serverUrl`（两者互斥，设置页文案说明）

---

## 三、PR 范围（文件级）

| 文件 | 变更 | 说明 |
|---|---|---|
| `packages/plugin/src/self-host.ts` | **新增**（~60 行）| 启动内置 Server（`createRemoteServer`），局域网 IP 探测 |
| `packages/plugin/src/cloudflare-tunnel.ts` | **新增**（~120 行）| cloudflared 下载/启动/重连；支持 `--token` 或 `--config` 两种模式 |
| `packages/plugin/src/config.ts` | 修改 | `selfHost` schema + ResolvedConfig 解析（默认关闭）|
| `packages/plugin/src/index.ts` | 修改 | `ensureSelfHost()`：启动 Server/Tunnel，覆盖 `serverUrl`，生命周期清理 |
| `packages/plugin/package.json` | 修改 | 依赖 `@dsh-remote/server": "workspace:*"` |
| `apps/server/package.json` | 修改 | 补 `main`/`exports`（供插件 import）|
| `README.md` / `README.zh.md` | 修改 | 「三种服务器模式」+ 自部署/ Tunnel 步骤（简短）|
| `tests/config.test.ts` | 修改 | 三模式解析 + 默认行为不变 + 参数校验（≥12 字符密码等）~6 用例 |

**不包含**（保持 PR 聚焦）：
- 我们 fork 的其他改动（超时收紧、perf、relay 记忆、跳过 P2P 开关）→ **单独 PR B**
- 光猫/IPv6/DDNS 自动化 → 不纳入（文档给指引）

---

## 四、兼容性与风险

| 风险 | 缓解 |
|---|---|
| 改变默认行为 | **不改变**：`selfHost.enabled` 默认 false，不填就是官方 |
| 上游维护负担（插件里跑 Server）| 内置 Server 是仓库自带 `apps/server`（官方开源自部署版本），**同仓库维护**，非新代码库 |
| bundle 体积增大（+~2MB）| 接受；Server 代码本来就在仓库里，只是被插件引用 |
| cloudflared 下载失败/慢 | 下载失败时降级为「仅局域网」并记日志；文档指导手动放二进制；支持 `configPath` 自定义 |
| 安全边界 | 沿用 Self-hosted Server 现有鉴权（账号密码 + 设备凭据 + Noise E2E）；**不新增公网监听逻辑**（Server 只监听本地/Tunnel） |
| 与官方 Server 冲突 | 二者互斥（`selfHost` 优先），设置页有说明文案 |

---

## 五、PR 策略（分两步走）

### PR A（本方案）：`feat(plugin): embedded self-hosted Server and Cloudflare Tunnel`

- **定位**：给高级用户一个「不依赖官方服务器」的选项，默认关闭、零影响
- **内容**：上面第三节全部
- **验证**：
  - `pnpm --filter ds-harness-remote check/build` + `verify-dsh-plugin`
  - `pnpm --filter @dsh-remote/server check/test/build`
  - 新增 config 解析测试
  - **真机链路已在我们本机验证**（Windows + 手机 5G → CF Tunnel → 本地 Server，IPv6 路径可达）
- **提交前**：向维护者发 issue 说明意图（避免直接 PR 被拒）——**建议先 issue 再 PR**

### PR B（后续，可选）：`perf(remote): faster connect and cheaper describe`

- **内容**：我们 fork 里已验证的优化：
  - **Host 插件端**：probe 缓存、并行 `hostDescribe + networkDetails`、`hostDescribe` 2s 封顶、连接诊断计时（`connectionTimings`）
  - **Android 端**（4a164ed 的 Android 部分）：`historyConfigured` 缓存（模式未变不重建）、`featuresCache`（按 clientVersion+harnessVersion 缓存能力探测）、并行 hostDescribe
  - **ICE/WebRTC 超时收紧**：ICE 凭据 5s→2s、WebRTC 6s→4s（b6a0946）
  - **werift IPv6 候选**（`iceIpv6` 配置）：对无原生 WebRTC 的环境提供 IPv6 host candidates——**默认 false（opt-in）**，避免改变现有行为
- **依赖**：PR A 合入后独立提交

### PR C（后续，可选）：`feat(android): opt-in "skip P2P on cellular" + relay memory`

> **这是用户最需要的功能**（其网络 P2P 必失败，每次白等 4-9 秒）

- **内容**（来自 fork 分支 `8f2904b` + `d93d9fe` + `4a164ed` 中已验证的 Android 体验改动）：
  - **`cellularSkipP2p` 设置开关**：4G/5G 下直接走 Relay，跳过打不通的 P2P（Wi-Fi 不受影响）
    - `lib/network-route.ts`：remote 网络 + 开关 → `['relay']`
    - `services/network-route.ts` 传参
    - 设置页 Toggle（schemastery 之外的 Android 原生设置项，7 种语言文案）
    - `connection-actions.ts` 连接时生效
  - **relay 记忆**：P2P 失败一次后，本次运行内后续连接直接 Relay（重启 App 才重试 P2P）——**仅内存，不持久化**
  - **连接耗时诊断行**：设置页显示 `connect/auth/transport/host` 四段耗时（便于用户上报问题）
- **验证**：Android check + 全量测试（482/482 已过）+ 真机（用户手机 5G 实测有效）
- **依赖**：无（可独立于 PR A）

---

## 六、fork 维护策略（补充章节）

| 问题 | 策略 |
|---|---|
| **官方 0.6.3 已发布新功能**（Android 主机切换 #316、图标/限流修复等）| fork 分支需**定期 merge upstream**（建议每 1-2 周），或**在 PR 全部合并后直接切回官方版**（首选）|
| fork 版本落后（0.6.3-fork.1 基于 0.6.2 基线）| 若官方 0.6.3 已含我们的稳定性修复 → **用户直接用官方 0.6.3**；fork 仅用于 PR 未合并部分的实验 |
| 双分支（official-pr / fork-stability-patches）| **PR 全部落地后删除 official-pr**，fork 分支保留 rebase 能力 |
| PR 与上游冲突 | 每次 PR 前 `git fetch upstream && git rebase upstream/main`（只保留未合并改动）|

---

## 七、执行计划（用户确认后）

1. 从 `fork-stability-patches` 整理出**自部署相关的最小改动集**（剔除无关改动）
2. 在干净分支 `pr-a-selfhost` 上重放（基于 **upstream main 最新**，避免冲突）
3. 本地验证：check / build / test / `verify-dsh-plugin` / 手动启动 + Host 连本地 Server
4. **先开 issue** 说明动机 + 方案（等维护者反馈）
5. 开 PR（附截图/配置示例/真机验证说明）
6. 跟进 review
7. **PR B/C** 同策略：独立分支（`pr-b-perf` / `pr-c-android-cellular`），基于最新 main 重放

---

## 八、需要你确认的点

1. **PR A 范围** 是否 OK（内置 Server + Tunnel，默认关闭）？
2. 是否**先开 issue 再 PR**（推荐，成功率更高）？
3. **PR B（perf + Android 缓存 + ICE 超时 + werift IPv6 opt-in）** 现在就做还是等 PR A 合并后？
4. 官方 0.6.3 已含我们之前的稳定性修复——**是否要基于 0.6.3 的最新 main 重做**（推荐）？
5. **「5G 跳过 P2P」= PR C**，一并提交？
6. **fork 维护策略**（merge 上游 or PR 合并后切回官方版）选哪个？


