# 职路：Python + MySQL 求职信息助手

这是一个以 Python 为主、MySQL 为可选持久化层的答辩项目。网站运行时使用 FastAPI 和 Jinja2 服务端渲染，不依赖浏览器 JavaScript。

## 技术结构

- `app.py`：FastAPI 应用入口、页面路由、登录会话和表单处理。
- `job_compass/`：密码与会话安全、论坛数据、联网检索和 DeepSeek 调用。
- `templates/`：Jinja2 服务端页面模板。
- `public/styles.css`：页面样式。
- `mysql_schema.sql`：MySQL 表结构。
- `data/forum.json`：未配置 MySQL 时的本地演示数据。
- `tests/`：Python 集成测试。

## 本地启动

首次运行安装依赖：

```powershell
python -m pip install -r requirements.txt
```

启动：

```powershell
python app.py
```

访问 `http://127.0.0.1:4173`。也可以直接运行 `启动网站.ps1`。

## 测试

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
```

测试覆盖统一登录会话、昵称首字头像、论坛复用账号、隐藏重复登录按钮、发帖与管理员审核，以及主页面无脚本渲染。

## 配置

复制 `.env.example` 为 `.env`，按需填写：

```text
DEEPSEEK_API_KEY=...
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=...
FORUM_SESSION_SECRET=...
FORUM_PHONE_HASH_SECRET=...
ADMIN_PASSWORD_HASH=...
MYSQL_URL=mysql://user:password@host:3306/database
```

没有配置 DeepSeek 或搜索密钥时，网站仍可启动并演示账号与论坛功能，企业筛选页会明确提示缺少配置。

## 登录与头像逻辑

用户在任一页面登录后，服务端会设置签名 HttpOnly Cookie。所有页面读取同一会话：顶部“用户登录”自动变为昵称首字圆形头像和用户昵称；论坛直接使用这个账号，不再显示第二组登录、注册按钮。

## 数据说明

手机号只保存哈希和脱敏值，密码使用 PBKDF2-SHA256 加盐哈希。简历正文只在当前请求中读取并发送给 DeepSeek，不写入本地文件或数据库。生产部署建议配置 MySQL，并执行 `mysql_schema.sql`。
