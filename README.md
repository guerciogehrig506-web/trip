# 足迹 · Travel Footprint

个人旅游足迹与规划 Web App —— 移动端优先（Mobile-First），以 GitHub 仓库作为无头内容管理（Git-backed CMS），通过在前端调用 GitHub REST API 直接读写仓库内的 Markdown / JSON / GeoJSON 文件。

## 技术栈

- Vue 3 (Composition API) + Vite + TypeScript
- Tailwind CSS（移动端 UI 风格）
- Leaflet.js（地图渲染）
- `@octokit/rest`（GitHub REST API 交互）
- `marked`（Markdown 解析）

## 本地开发

```bash
npm install
npm run dev
```

构建生产产物：

```bash
npm run build   # 输出到 dist/
```

## 部署到 GitHub Pages

本项目通过 GitHub Actions 自动构建并部署，配置见 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。

### 一次性配置步骤

1. **推送代码到 GitHub 仓库**（`main` 或 `master` 分支均可，workflow 两者都已监听）。

2. **启用 GitHub Pages 的 Actions 部署源**（关键步骤）：
   - 打开仓库 **Settings → Pages**。
   - 在 **Build and deployment → Source** 下拉框中选择 **GitHub Actions**（不要选 `Deploy from a branch`）。

   这是因为 `deploy.yml` 使用的是官方 `actions/deploy-pages` 方案，它需要 Pages 源设置为 GitHub Actions，而不是从 `gh-pages` 分支部署。

3. **（可选）配置仓库 Actions 权限**：
   - 仓库 **Settings → Actions → General → Workflow permissions** 选择 **Read and write permissions**。
   - 通常 `permissions` 已在 `deploy.yml` 中显式声明（`pages: write` / `id-token: write`），若首次运行报权限错误再检查此项。

4. **触发部署**：
   - 推送到 `main`/`master` 会自动触发；也可在 **Actions** 页面手动点击 **Run workflow**。

5. 部署完成后，站点地址为：

   ```text
   https://<你的用户名>.github.io/<仓库名>/
   ```

### 部署配置要点说明

| 项目 | 说明 |
| --- | --- |
| `base: './'` | Vite 已配置为相对路径，兼容项目站点位于子目录的场景，无需再改 |
| 构建输出 | `dist/` 目录，由 `upload-pages-artifact` 上传 |
| Node 版本 | Node.js 20 |
| 依赖安装 | `npm ci`（依赖 `package-lock.json` 进行可复现安装） |

### SPA 刷新 404 解决方案

GitHub Pages 本身不支持服务端路由重写，直接访问子路径或刷新会返回 404。本项目采用 **404 引导脚本** 方案解决：

- [`public/404.html`](public/404.html)：作为 GitHub Pages 的自定义 404 页，把原始路径编码进查询串后重定向回首页。
- [`index.html`](index.html)：内联脚本解析查询串，用 `history.replaceState` 还原真实 URL，路由继续由前端接管。

这套机制在引入前端路由（如 `vue-router`）后即可无缝工作，无需改动部署脚本。

> 说明：项目当前使用 `base: './'` 相对路径，资源引用不受站点子路径影响；若未来改用 History 路由，保持 `base` 与仓库名一致即可。