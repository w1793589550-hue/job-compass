# 职路：应届生企业筛选助手

这是一个本地运行的网站原型，用于将年龄、身份、工作地点、实际行政区、
岗位偏好和目标公司数量套入一份可编辑的企业筛选模板。系统先调用
DeepSeek 校准模糊需求，再通过独立搜索服务取得网页证据，最后要求模型只
依据证据包生成分析结果。

## 启动

直接双击 `启动网站.lnk`。该快捷方式会调用 `启动网站.ps1`，不再经过
Windows CMD，因此不会受到批处理文件代码页乱码的影响。

也可以右键 `启动网站.ps1`，选择“使用 PowerShell 运行”。

还可以在当前目录执行：

```powershell
npm run dev
```

然后访问：

```text
http://127.0.0.1:4173
```

## 配置

服务端从 `.env` 读取：

```text
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=...
SEARCH_MAX_RESULTS=12
SOURCE_VERIFICATION_LIMIT=36
DAILY_TAVILY_CREDIT_QUOTA=40
TAVILY_CREDIT_COST_CNY=0.213378
DEEPSEEK_INPUT_CACHE_HIT_CNY_PER_MILLION=0.2
DEEPSEEK_INPUT_CACHE_MISS_CNY_PER_MILLION=2
DEEPSEEK_OUTPUT_CNY_PER_MILLION=3
RATE_LIMIT_WINDOW_MS=600000
GENERATE_RATE_LIMIT=6
RESUME_RATE_LIMIT=12
PORT=4173
```

`.env` 已被 `.gitignore` 排除，不应提交或发送给其他人。需要重新配置时，
可参考 `.env.example`。

也可以改用 Brave Search：

```text
SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=...
```

DeepSeek API Key 只负责需求校准和证据整理。当前没有把 DeepSeek 推理接口
冒充为搜索引擎；未配置独立搜索 API 时，网站会拒绝生成公司事实清单。

## 已实现

- 年龄、身份、地点和公司数量均支持预设选项与自定义输入。
- 城市选择后可进一步复选区、县或新区，并可添加自定义实际区域。
- 岗位偏好支持预设方向和自由描述。
- 支持严格、平衡、新兴企业三种筛选模式，切换时同步更新模板、核验条件和后端检索重点。
- 新兴企业模式要求公开规模至少 20 人，优先检索招聘平台标注为 20 至 99 人的科技企业。
- 每种模式分别保存用户修改过的模板，切换后再次返回不会丢失。
- 可在 `deepseek-v4-flash` 与 `deepseek-v4-pro` 之间切换。
- 左侧展示完整模板，可局部修改、全部重写或恢复默认值。
- DeepSeek 由本地 Node 服务端代理调用，密钥不进入浏览器代码。
- 后端先规范化模糊描述，再生成覆盖 BOSS 直聘、猎聘、企业官网、大学就业
  网、政府或行业媒体及劳动争议反向检索的查询词。
- 联网结果会去重，服务端会在拦截私有网络地址后读取可访问网页正文，并形成编号证据包。
- 结果页面区分“服务端直接读取正文”“Tavily 正文抽取”和“仅搜索摘要”；招聘状态、应届适配、地点、薪资等强事实只能由前两类正文支持。
- 搜索无结果时停止生成，不以模型记忆补足公司名单。
- 浏览器会生成匿名账号标识；服务端仅对 Tavily 反向验证 credits 设置每日额度，DeepSeek 按实际输入、输出 token 记录人民币预估成本，同时保留短时接口限流。
- 简历分析必须勾选隐私授权，可随时撤回并清除本页内容；服务端只保存授权版本、时间、Tavily credits 与 DeepSeek token 用量，不保存简历正文。
- 提供独立隐私政策页面。
- 支持 Markdown 标题、列表、表格和链接展示。
- 包含加载、失败、复制结果和移动端侧栏状态。
- 使用 `npm test` 运行限流、额度持久化、正文提取、私网拦截和接口保护测试。

## 已知边界

搜索 API 返回的是网页索引结果。系统会尝试读取网页正文，但 BOSS 直聘、猎聘等
页面可能要求登录、限制抓取、采用动态渲染或已经过期；服务端直接读取失败时会优先使用
Tavily 返回的正文抽取，仍然只有搜索摘要的来源不能支持强事实结论。
因此结果只能说明“本次检索可见什么”，不能证明某家公司绝对没有劳动争议，
也不能替代投递前人工打开原链接复核。

若要形成正式产品，仍应依法接入并取得授权的数据层：

1. 企业登记信息；
2. 企业官网和校招页面；
3. 政府媒体与行业协会报道；
4. 招聘信息及发布日期；
5. 依法公开的劳动争议和司法风险信息；
6. 来源快照、访问日期与人工复核状态。

## 安全提示

API Key 曾出现在交流内容中时，正式发布前应在 DeepSeek 控制台轮换密钥，
并使用部署平台的 Secret 或环境变量功能保存新密钥。

## GitHub + Render 部署

### 1. 上传到 GitHub

先在 GitHub 新建一个空仓库，推荐仓库名为 `job-compass`。不要勾选自动生成
README、`.gitignore` 或 license，避免和本地文件冲突。

然后在本项目目录执行：

```powershell
git init
git add .
git commit -m "Deploy job compass"
git branch -M main
git remote add origin https://github.com/你的GitHub用户名/job-compass.git
git push -u origin main
```

### 2. 创建 Render Web Service

在 Render 选择 `New +` -> `Web Service`，连接刚才的 GitHub 仓库。

常规配置：

```text
Runtime: Node
Build Command: npm ci
Start Command: npm start
```

本项目已包含 `render.yaml`。如果使用 Render Blueprint，也可以让 Render 读取
该文件创建服务。

### 3. 配置 Render 环境变量

在 Render 服务的 `Environment` 页面添加：

```text
HOST=0.0.0.0
NODE_ENV=production
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=你的 Tavily Key
ADMIN_PASSWORD_HASH=你的管理员密码哈希
ADMIN_SESSION_SECRET=一段足够长的随机字符串
ADMIN_SESSION_TTL_MS=43200000
```

可选变量：

```text
SEARCH_MAX_RESULTS=12
SOURCE_VERIFICATION_LIMIT=36
DAILY_TAVILY_CREDIT_QUOTA=40
TAVILY_CREDIT_COST_CNY=0.213378
RATE_LIMIT_WINDOW_MS=600000
GENERATE_RATE_LIMIT=6
RESUME_RATE_LIMIT=12
```

### 4. 访问线上地址

部署完成后打开 Render 给出的 `https://...onrender.com` 地址。管理员统计、API
调用、访问统计都应通过线上地址使用。

注意：Render 免费 Web Service 的运行时文件写入不适合长期保存数据。当前
`data/analytics.json` 和 `data/usage.json` 在服务重启或重新部署后可能丢失。
如果要长期保存浏览统计，需要接 Render Disk 或改为数据库。
