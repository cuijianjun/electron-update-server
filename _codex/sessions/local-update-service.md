# 本机更新服务交付 — 2026-11-14
目标：本机常驻server支持两client全量/签名增量，key/config初始化，测试后3repo GitHub。
Server /Users/cjjxw/study/yz/electron-update-server，工作agent/update-server-main，空基线9e0b700；GitHub私有cuijianjun/electron-update-server已创建，首次源码推main并保留工作分支。两client仍agent/vue3-upgrade-main，原代码基线不改写；最终回执以git log/远端ref为准。
本机LaunchAgent com.cjjxw.electron-update-server正在运行127.0.0.1:25565，healthz返回ok；配置~/.config/electron-update-server/config.json；keys每项目独立Ed25519、目录700/private600，私钥禁止Git，已有client trust必须保留原key；新部署重配需显式--new-deployment。
Data/logs/baselines ~/.local/share/electron-update-server永久保留；profile~/Library/LaunchAgents/com.cjjxw.electron-update-server.plist。Win x64/UOS x64+arm64完整包及签名renderer1.0.0已发布；同版本无更新正常，三个目标真实full Range/资源signature+SHA256已过。仅同机，未部署公网/未新增UOS目标机认证。
Client改动：公钥+本机URL模板、expandUpdateURL严格展开arch/platform/runtimeId、旧update:serve夹具和统一入口、测试禁用日常源。没有client依赖/锁变化。
验证server12+真实client contract2通过；各client41unit+6e2e+HMR1。恢复prod后所有ASAR dist字节/信任配置/当前服务runtime一致。真实GDD大批multipart无fallback，abort/不可变/并发/签名/读写links/trust保护覆盖；隐藏data根403已修为basename+显式root，不放松safeFile/dotfiles。独立非实现者review闭环无阻塞。Docker compose config过，未build image；实际原生Node24.22.0/npm11.19.1。
Source规格specs/001-local-update-service/tasks.md含详细回执；logs/tmp/electron-update-service-20261114可清理，中转包验收后清理；真实keys/data不能删。原VM仍suspended/pause-on，其他任务/参考repo/Codex历史不得动。
GitHub创建由Chrome独立新窗口完成，不需要gh登录；SSH可推。push后在同窗口留一张仓库截图并关闭该窗口，原Feishu窗口不动，所有UI仅Cua。此卡不自记提交hash（防额外状态commit），查git实际状态再继续。
