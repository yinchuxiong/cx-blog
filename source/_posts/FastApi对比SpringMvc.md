title: FastApi对比SpringMvc
author: Soar
comments: true
abbrlink: '18834'
tags:
  - Python
  - FastApi
categories: []
cover: /img/default_cover.jpg
keywords: []
date: 2026-07-16 11:28:00
---
## 1. FastAPI 是什么

FastAPI 是一个现代、高性能的 Python Web 框架，用于构建 REST API。底层基于 Starlette（路由引擎）和 Pydantic（数据校验）。

**核心特色：**

- 性能媲美 Node.js / Go
- 写完代码自动生成 Swagger UI（`/docs`）和 ReDoc（`/redoc`）交互式文档
- 基于 Python 类型注解，简洁且具备自动校验能力

**最小示例：**

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello, FastAPI!"}
```

**定位：** Python 世界的 Spring Web MVC，处理路由、参数绑定、校验、返回 JSON。底层由 Uvicorn（ASGI 服务器）驱动，无需 Servlet 容器。

---

## 2. 路径参数 & 查询参数

### 路径参数（Path Parameters）

写在 URL 路径中，用 `{}` 包裹。类型注解自动完成**类型转换**和**校验**。

```python
@app.get("/users/{user_id}")
def get_user(user_id: int):
    return {"user_id": user_id}
```

- 访问 `/users/42` → `user_id` = 整数 `42`
- 访问 `/users/abc` → 自动返回 422 校验错误

### 查询参数（Query Parameters）

URL 中 `?` 后面的键值对。未出现在路径装饰器中的函数参数自动成为查询参数，有默认值即为可选。

```python
@app.get("/users")
def list_users(page: int = 1, keyword: str = ""):
    return {"page": page, "keyword": keyword}
```

| 访问 URL | 效果 |
|-----------|------|
| `/users?page=2&keyword=老王` | `{"page": 2, "keyword": "老王"}` |
| `/users` | 使用默认值 `{"page": 1, "keyword": ""}` |

### 对比

| | 路径参数 | 查询参数 |
|------|----------|-----------|
| 位置 | URL 路径中 `/users/{id}` | `?` 后面 `?page=1` |
| 用途 | 标识「哪一个」资源 | 筛选 / 分页 / 排序 |
| 必填 | 无默认值时必填 | 有默认值即为可选 |
| 例子 | `GET /products/9527` | `GET /products?category=book` |

> 规则：路径中用 `{}` 定义的是路径参数，其余函数参数默认是查询参数。

---

## 3. 请求体与 Pydantic 模型

对应 Spring MVC 的 `@RequestBody` + `@Valid`，定义结构和校验合二为一。

```python
from pydantic import BaseModel, Field

class CreateUserRequest(BaseModel):
    name: str
    age: int = Field(ge=0, le=150)        # 0~150 之间
    email: str | None = None               # 可选字段

@app.post("/users")
def create_user(user: CreateUserRequest):
    return {"id": 1, "name": user.name}
```

**自动行为：**

- 校验 `name` 为 `str`，`age` 为 `int` 且在 0~150
- `email` 可选，没传则为 `None`
- 校验失败自动返回 422 + 字段级错误详情
- 校验通过则 `user` 即为 `CreateUserRequest` 实例

**关键点：**

- `BaseModel` — Pydantic 基类，继承即获得校验能力
- `Field()` — 加约束（范围、长度、正则等）
- `str | None = None` — Python 3.10+ 可选字段写法

---

## 4. 响应模型

通过 `response_model` 控制返回给前端的数据结构，自动过滤和转换。

```python
class UserResponse(BaseModel):
    id: int
    name: str
    email: str

@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int):
    user = db.query(User).get(user_id)
    return user  # 自动过滤，只返回 UserResponse 中声明的字段
```

**三件事：**

| 作用 | 说明 |
|------|------|
| 过滤字段 | 只输出模型中声明的字段（密码等敏感字段自动剥离） |
| 类型转换 | `datetime` → ISO 字符串、ORM 对象 → dict |
| 文档生成 | 自动在 Swagger 文档中展示响应结构 |

---

## 5. 依赖注入 `Depends`

对应 Spring 的 `@Autowired`，但注入的是**函数执行的返回值**，不止是对象。

```python
from fastapi import Depends, Header, HTTPException

def get_current_user(token: str = Header()):
    user = parse_token(token)
    if not user:
        raise HTTPException(status_code=401)
    return user

@app.get("/profile")
def get_profile(current_user=Depends(get_current_user)):
    return {"user": current_user}
```

**三种常见用法：**

| 场景 | 示例 |
|------|------|
| 认证校验 | `Depends(get_current_user)` — 每个接口自动验 token |
| 数据库连接 | `Depends(get_db)` — 自动获取和释放连接 |
| 权限检查 | `Depends(require_admin)` — 校验通过才往下走 |

> `Depends` = 把可复用逻辑抽成函数，FastAPI 自动调用并把结果注入接口参数。

---

## 6. 异常处理

`HTTPException` 对应 Spring 的 `ResponseStatusException`。

```python
from fastapi import HTTPException

@app.get("/users/{user_id}")
def get_user(user_id: int):
    user = db.find(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user
```

**常用状态码：**

| code | 含义 | 使用场景 |
|------|------|------|
| 400 | 请求错误 | 参数校验不通过 |
| 401 | 未认证 | 没登录 / token 无效 |
| 403 | 无权限 | 登录了但权限不足 |
| 404 | 未找到 | 资源不存在 |
| 409 | 冲突 | 重复创建同名资源 |
| 422 | 不可处理 | Pydantic 自动校验失败 |

**全局异常处理器**（类似 `@ControllerAdvice`）：

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(HTTPException)
async def custom_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "msg": exc.detail, "data": None}
    )
```

---

## 7. 中间件（Middleware）

中间件是每个请求的「安检口」，在接口函数前后执行。对应 Spring 的 `Filter`。

```python
from fastapi import Request

@app.middleware("http")
async def log_middleware(request: Request, call_next):
    print(f"📥 {request.method} {request.url}")   # 请求进入时
    response = await call_next(request)             # 放行
    print(f"📤 {response.status_code}")             # 响应返回时
    return response
```

**执行流程：** `请求 → 中间件前处理 → call_next() → 实际接口 → 中间件后处理 → 响应`

**常见场景：**

| 场景 | 说明 |
|------|------|
| 日志 | 记录每个请求的方法、路径、耗时 |
| CORS | 允许跨域（FastAPI 内置 `CORSMiddleware`） |
| 限流 | 统计 IP 请求频率 |
| 全局兜底 | 捕获未处理异常 |

**计算耗时示例：**

```python
import time

@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    elapsed = (time.time() - start) * 1000
    response.headers["X-Process-Time"] = f"{elapsed:.0f}ms"
    return response
```

---

## 8. 路由分组（APIRouter）

按模块拆分路由，对应 Spring 里 `@RequestMapping` 分包管理。

**目录结构：**

```
├── main.py              # 入口，组装路由
├── routers/
│   ├── users.py         # 用户模块
│   └── orders.py        # 订单模块
```

**`routers/users.py`：**

```python
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["用户管理"])

@router.get("/")
def list_users():
    return [{"id": 1, "name": "张三"}]

@router.post("/")
def create_user():
    return {"id": 2}

@router.get("/{user_id}")
def get_user(user_id: int):
    return {"id": user_id, "name": "张三"}
```

**`main.py`：**

```python
from fastapi import FastAPI
from routers import users, orders

app = FastAPI()
app.include_router(users.router)
app.include_router(orders.router)
```

| Spring | FastAPI |
|------|------|
| `@RequestMapping("/users")` | `APIRouter(prefix="/users")` |
| 按 Controller 类拆分 | 按 router 模块拆分 |
| `@Tag(name = "...")` | `tags=["..."]` |
| 自动扫描装配 | 手动 `app.include_router()` |

---

## 9. 项目实战结构

```
myapp/
├── main.py                 # 入口：创建 app，挂载路由
├── config.py               # 配置（数据库地址、密钥等）
├── models/                 # 数据库表模型（SQLAlchemy）
│   └── user.py
├── schemas/                # Pydantic 请求/响应模型（DTO）
│   └── user.py
├── routers/                # 接口路由（Controller）
│   ├── users.py
│   └── orders.py
├── services/               # 业务逻辑层（Service）
│   └── user_service.py
└── dependencies.py         # 共享 Depends（认证、拿 DB）
```

**分层对应：**

| 层 | Spring 对应 | 职责 |
|------|------|------|
| `routers/` | `@Controller` | 接收请求，调用 service，返回响应 |
| `services/` | `@Service` | 业务逻辑，不碰 HTTP |
| `schemas/` | DTO | 定义输入输出的数据结构 |
| `models/` | `@Entity` | 数据库表映射 |
| `dependencies.py` | 公共 Bean / 切面 | 认证、DB 会话等复用逻辑 |
| `config.py` | `application.yml` | 环境配置 |

**请求流转：** `Router → 校验(schema) → Depends(认证/DB) → Service(业务) → Model(数据库) → response_model 过滤 → 返回 JSON`

---

## 10. 数据库集成（SQLAlchemy）

### 配置连接

```python
DATABASE_URL = "sqlite:///./app.db"                         # SQLite
# DATABASE_URL = "postgresql://user:pass@localhost/dbname"  # PostgreSQL
# DATABASE_URL = "mysql+pymysql://root:123456@localhost/db" # MySQL
```

### 定义模型

```python
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

engine = create_engine("sqlite:///./app.db")
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)

Base.metadata.create_all(bind=engine)
```

### DB 会话依赖注入

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 增删改查

```python
router = APIRouter(prefix="/users", tags=["用户管理"])

# 查
@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()

# 增
@router.post("/", response_model=UserResponse)
def create_user(req: CreateUserRequest, db: Session = Depends(get_db)):
    user = User(name=req.name, email=req.email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

# 改
@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, req: CreateUserRequest, db: Session = Depends(get_db)):
    user = db.query(User).get(user_id)
    user.name, user.email = req.name, req.email
    db.commit()
    return user

# 删
@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    db.delete(db.query(User).get(user_id))
    db.commit()
    return {"ok": True}
```

### 与 Spring 对应

| Spring | FastAPI（SQLAlchemy） |
|------|------|
| `@Entity` + `@Table` | `Base` + `__tablename__` |
| `JpaRepository` | `db.query(User)` |
| `@Transactional` | `db.commit()` / `db.rollback()` |
| `application.yml` | `config.py` |
| 连接池（HikariCP） | SQLAlchemy 内置连接池 |

---

## Spring Web MVC ↔ FastAPI 速查表

| Spring Web MVC | FastAPI |
|------|------|
| `@RestController` | `APIRouter` / `@app.get()` |
| `@GetMapping("/xxx")` | `@app.get("/xxx")` |
| `@PathVariable` | 路径参数 `{param}` |
| `@RequestParam` | 查询参数（函数参数默认） |
| `@RequestBody` + `@Valid` | Pydantic `BaseModel`（自动校验） |
| `@ResponseBody` | `return dict`（自动 JSON） |
| `@Autowired` | `Depends()` |
| `@ControllerAdvice` | `@app.exception_handler()` |
| `Filter` / `HandlerInterceptor` | `@app.middleware("http")` |
| `@RequestMapping` 分包 | `APIRouter(prefix=...)` |
| `application.yml` | `config.py` |
| `@Entity` + `@Table` | SQLAlchemy `Base` + `__tablename__` |
| `JpaRepository` | `db.query(User)` |
| Tomcat | Uvicorn |
