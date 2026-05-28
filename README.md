# Serenity Tracker

一个用于追踪 `@aleabitoreddit` 公开发帖的小型 GitHub Pages 仪表盘。

## 页面内容

- 最近发帖摘要
- 高频股票提及榜
- 主题强度
- 当前结论和风险提示

## 自动更新

仓库里的 GitHub Actions 会每天运行一次 `scripts/update.mjs`，从公开页面抓取可见发帖并更新 `data.json`。

如果公开页面限制访问，页面会保留上一次成功更新的数据。
