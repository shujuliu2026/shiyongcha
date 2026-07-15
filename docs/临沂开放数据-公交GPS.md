# 临沂开放数据 · 公交 GPS

数据来源：[临沂市公共数据开放网](http://lydata.sd.gov.cn/linyi/)  
发布单位：临沂市公共交通集团有限公司（信用代码 `9137130016829134XT`）  
目录页：[/linyi/api/index?filterParam=org_code_enterprise&filterParamCode=9137130016829134XT](http://lydata.sd.gov.cn/linyi/api/index?filterParam=org_code_enterprise&filterParamCode=9137130016829134XT&page=1)

## 目标接口

| 项 | 值 |
|----|-----|
| 名称 | 临沂市_市公交公司_办公室_公交车GPS及站点数据信息查询服务 |
| 详情 | http://lydata.sd.gov.cn/linyi/api/2b8a60ca4d124610a590ff56b6e56033/detail |
| Gateway | `http://lydata.sd.gov.cn/gateway/api/1/gjcGPSjzdsjxx` |
| 请求方式 | **GET** |
| 开放属性 | 无条件开放（**仍须申请令牌**） |
| 分页参数 | `STARTNUM`（起始条数）、`PAGENUM`（每页条数），须按 RFC 1738 URL 编码 |

### 鉴权头（官方《调用说明》）

| Header | 说明 |
|--------|------|
| `X-Client-Id` | 用户中心 → 我的令牌 → Client-Id |
| `X-Timestamp` | 当前毫秒时间戳，有效约 **10 分钟** |
| `X-Nonce` | 调用方随机数（实现用 UUID） |
| `X-Signature` | `Base64(HmacSHA256(ClientId + Timestamp + Nonce, ClientSecret))`，密钥为令牌密钥 |

### 主要返回字段

| 字段 | 含义 |
|------|------|
| `license_plate_number` | 车牌号 |
| `vehicle_identification` | 车辆标识 |
| `line_id` | 线路 ID / 跑法号 |
| `line_version` | 线路版本 |
| `gps_longitude` / `gps_latitude` | GPS 经纬度 |
| `gps_speed` / `gps_direction` | 速度 / 方向 |
| `site_sequence_number` | 站点顺序号 |
| `entry_and_exit_status` | 进出站状态 |
| `up_and_down` | 上下行 |
| `operational_status` | 运营状态 |
| `gps_date_time` | GPS 日期时间 |
| `S_CREATETIME` / `S_LAST_UPDATETIME` | 创建 / 更新时间 |

未配置或签名错误时，网关常返回「请求者标识不存在」或认证失败类提示。

## 申请步骤（运营）

1. 打开 http://lydata.sd.gov.cn/linyi/ 注册并登录  
2. **用户中心 → 我的令牌**，复制 **Client-Id** 与 **签名认证令牌密钥**  
3. 打开上述详情页 → **申请接口**（无条件开放一般审核较快）  
4. 在本仓库根目录 `.env` 写入：

```env
LYDATA_CLIENT_ID=你的Client-Id
LYDATA_CLIENT_SECRET=你的令牌密钥
# 可选
# LYDATA_BUS_CACHE_MS=20000
# LYDATA_BUS_PAGE_SIZE=100
# LYDATA_BUS_MAX_FETCH=500
# LYDATA_BUS_GATEWAY=http://lydata.sd.gov.cn/gateway/api/1/gjcGPSjzdsjxx
```

若已配置同体系的 `SD_OPEN_CLIENT_ID` / `SD_OPEN_CLIENT_SECRET`，且该令牌已申请本接口，可不单独写 `LYDATA_*`（实现会回退复用）。  
wikimap / tool 的 `.env` **前两行裸 hex** 也会自动认作通用 Client-Id / Secret。

### 在线调用成功 ≠ 代码签名已开通

详情页「在线接口调用」通常走 **简单认证（AppKey / 登录会话）**，可直接看到样例如：

```json
{
  "license_plate_number": "鲁Q00563D",
  "line_id": "1071",
  "gps_latitude": "34.891983",
  "gps_longitude": "118.322693"
}
```

实用查 `/bus` 走 **签名认证**（`X-Client-Id` + Hmac 签名）。两种通道互相独立：

| 现象 | 含义 |
|------|------|
| 在线调用有数据，代码 `300 权限认证失败` | 简单认证/会话可用，**当前签名 Client-Id 尚未绑上本接口** |
| 空气质量 `200`、公交 `300` | 同一签名令牌有效，只是公交接口未授权给该 Client-Id |

请核对：用户中心 → **我的申请** → 「公交车GPS及站点…」→ 绑定的是否为 `.env` 里那套 **签名认证 Client-Id**（不是另一套旧令牌）。若刚通过，网关偶发延迟，可几分钟后再试。

5. 重启 API：`npm run api`  
6. 验证：`GET http://127.0.0.1:5180/api/v1/local/bus/status` → `configured: true`  
7. 查询：`GET /api/v1/local/bus/gps?line=&plate=&lat=&lng=&radius_km=2`

## 实用查暴露

| 端 | 路径 |
|----|------|
| H5 | `/bus` |
| 状态 | `GET /api/v1/local/bus/status` |
| 查询 | `GET /api/v1/local/bus/gps` |

实现：`packages/shared/lydata-bus.mjs`（HmacSHA256 签名、分页拉取、约 20s 内存缓存；密钥仅在服务端）。

## 合规

- 遵守开放网使用许可；勿把 Client-Id / Secret 写进前端或 git  
- 展示「仅供参考」；控制刷新频率，避免打爆网关  
