# 微信小程序后接

一期以独立 H5 为准。

## 路径 A · web-view

1. 部署 H5 到 HTTPS（如 `https://info.example.com`）
2. 公众平台配置业务域名 + 校验文件
3. 小程序页：`<web-view src="https://info.example.com/" />`

## 路径 B · 原生

| 模块 | 做法 |
|------|------|
| 台风/地图 | `map` + polyline |
| 联行号 / 本地列表 | 表单请求本项目 API |
| 坐标 | 移植 `apps/web/src/utils/coordConvert.js` |
| 定位 | `wx.getLocation` |

API 合法域名指向本仓库部署的 `apps/api`。
