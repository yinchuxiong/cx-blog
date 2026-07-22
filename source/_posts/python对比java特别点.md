title: python对比java特别点
author: Soar
comments: true
abbrlink: '41486'
tags:
  - Python
  - python
categories:
  - python
cover: /img/default_cover.jpg
keywords: []
date: 2026-07-22 22:21:00
---


## 一、私有方法与私有变量

Python **没有** Java 的 `private` / `protected` / `public` 关键字。所有成员默认都是公开的，通过**命名约定**和**名称改写**来模拟访问控制。

### 1.1 三种命名约定

| Java | Python | 含义 |
|------|--------|------|
| `public` | `name` | 公开，随时可访问 |
| `protected` | `_name` | **约定**：内部使用，外部别碰（PEP 8） |
| `private` | `__name` | **名称改写**：解释器将其重命名为 `_ClassName__name`，防止子类意外覆盖 |

### 1.2 代码对照

```java
// Java
public class Person {
    public String name;           // 公开
    protected int age;            // 子类可访问
    private String idCard;        // 仅本类可访问

    public String getIdCard() { return idCard; }
    private boolean validate() { return true; }
}
```

```python
# Python
class Person:
    def __init__(self):
        self.name = "Alice"         # 公开 — 约定为 public
        self._age = 18              # 受保护 — "请勿触碰" (protected 语义)
        self.__id_card = "X123"     # 私有 — 名称改写为 _Person__id_card

    # --- 公开方法 ---
    def get_id_card(self):
        """相当于 Java 的 public getter"""
        return self.__id_card

    # --- "受保护" 方法 (约定) ---
    def _show_age(self):
        """子类 / 包内使用，外部不要调用"""
        return self._age

    # --- "私有" 方法 (名称改写) ---
    def __validate(self):
        """解释器将其改写为 _Person__validate"""
        return len(self.__id_card) > 0

    def is_valid(self):
        return self.__validate()       # ← 类内正常调用，没问题 ✓


# === 外部访问情况 ===
p = Person()
print(p.name)            # ✓ Alice
print(p._age)            # ✓ 18 (能访问，但你不应该这样做)
# print(p.__id_card)     # ✗ AttributeError
print(p._Person__id_card)  # ✓ 绕过改写也能读到（不推荐！）
```

### 1.3 属性装饰器：Python 风格的 getter/setter

```java
// Java 标准 getter/setter
public class User {
    private String name;
    public String getName() { return name; }
    public void setName(String n) { this.name = n; }
}
```

```python
# Pythonic 写法 — 使用 @property
class User:
    def __init__(self):
        self._name = ""

    # --- getter ---
    @property
    def name(self):
        """调用方式：user.name（不用 user.name()）"""
        return self._name

    # --- setter ---
    @name.setter
    def name(self, value: str):
        """调用方式：user.name = 'Bob'（自动触发）"""
        if not value.strip():
            raise ValueError("name 不能为空")
        self._name = value

    # --- deleter ---
    @name.deleter
    def name(self):
        del self._name


u = User()
u.name = "Charlie"      # 像访问字段一样，实际调用了 setter
print(u.name)           # Charlie — 实际调用了 getter
```

### 1.4 只读属性

```java
// Java: 只有 getter，没有 setter
public class Config {
    private final String env;
    public Config(String env) { this.env = env; }
    public String getEnv() { return env; }
}
```

```python
# Python: 只定义 @property，不定义 @xxx.setter
class Config:
    def __init__(self, env: str):
        self._env = env

    @property
    def env(self) -> str:
        return self._env


c = Config("production")
print(c.env)       # production
# c.env = "dev"    # AttributeError: can't set attribute ✓
```

---

## 二、方法泛型（类型变量 / TypeVar）

Java 的泛型在编译期检查，运行时擦除。Python 的类型注解**不影响运行时**，但搭配 `mypy` / `pyright` 可获得静态检查。Python 3.12+ 引入了更简洁的泛型语法。

### 2.1 基本泛型方法

```java
// Java
public <T> T first(List<T> items) {
    return items.get(0);
}
public <T extends Comparable<T>> T max(List<T> items) { ... }
```

```python
# Python (传统写法)
from typing import TypeVar, Sequence

T = TypeVar("T")

def first(items: Sequence[T]) -> T:
    """返回序列的第一个元素，类型与输入一致"""
    return items[0]


# 有上界的 TypeVar — 等价于 Java 的 <T extends Comparable<T>>
from typing import TypeVar
from typing import Protocol  # Python 3.8+ 的结构性子类型

class Comparable(Protocol):
    def __lt__(self, other) -> bool: ...

CT = TypeVar("CT", bound=Comparable)   # 等价于 <T extends Comparable>

def my_max(items: list[CT]) -> CT:
    return max(items)


# === Python 3.12+ 新语法（推荐） ===
# def first[T](items: Sequence[T]) -> T:
#     return items[0]
#
# def my_max[T: Comparable](items: list[T]) -> T:    # 带约束
#     return max(items)
```

### 2.2 泛型类

```java
// Java
public class Box<T> {
    private T value;
    public T getValue() { return value; }
    public void setValue(T value) { this.value = value; }
}
```

```python
# Python 传统写法
from typing import Generic, TypeVar

T = TypeVar("T")

class Box(Generic[T]):
    def __init__(self, value: T | None = None):
        self._value = value

    def get_value(self) -> T | None:
        return self._value

    def set_value(self, value: T) -> None:
        self._value = value


# Python 3.12+ 新语法
# class Box[T]:
#     def __init__(self, value: T | None = None):
#         self._value = value
#
#     def get_value(self) -> T | None:
#         return self._value
#
#     def set_value(self, value: T) -> None:
#         self._value = value


# 使用
int_box = Box[int]()
int_box.set_value(42)
x: int | None = int_box.get_value()
```

### 2.3 方法中的泛型类型（重要场景）

```java
// Java — 真实场景
public class Mapper {
    public <F, T> List<T> map(List<F> source, Function<F, T> mapper) { ... }

    public <K, V> Map<K, V> toMap(List<V> items, Function<V, K> keyExtractor) { ... }
}
```

```python
from typing import TypeVar, Callable, Iterable

F = TypeVar("F")    # From
T = TypeVar("T")    # To
K = TypeVar("K")    # Key

# 函数上的泛型
def my_map(items: Iterable[F], mapper: Callable[[F], T]) -> list[T]:
    """等价于 Java 的 <F, T> List<T> map(...)"""
    return [mapper(item) for item in items]


def to_dict(items: Iterable[T], key_func: Callable[[T], K]) -> dict[K, T]:
    """等价于 Java 的 <K, T> Map<K, T> toMap(...)"""
    return {key_func(item): item for item in items}


# === Python 3.12+ 新语法 ===
# def my_map[F, T](items: Iterable[F], mapper: Callable[[F], T]) -> list[T]:
#     return [mapper(item) for item in items]
#
# def to_dict[T, K](items: Iterable[T], key_func: Callable[[T], K]) -> dict[K, T]:
#     return {key_func(item): item for item in items}


# 使用
result: list[int] = my_map(["1", "2", "3"], int)   # [1, 2, 3]
d: dict[int, str] = to_dict(["a", "bb"], len)       # {1: "a", 2: "bb"}
```

### 2.4 泛型方法在类中

```java
// Java
public class Repository<T> {
    public List<T> findByIds(List<Long> ids) { ... }
    public <R> R transform(Function<T, R> fn) { ... }
}
```

```python
from typing import TypeVar, Generic

T = TypeVar("T")
R = TypeVar("R")

class Repository(Generic[T]):
    def find_by_ids(self, ids: list[int]) -> list[T]:
        """用类上绑定的 T，返回值 list[T]"""
        ...

    def transform(self, fn: Callable[[T], R]) -> R:
        """方法级别引入新的类型变量 R — 等价于 Java 的 <R> R transform(...)"""
        ...

# Python 3.12+
# class Repository[T]:
#     def find_by_ids(self, ids: list[int]) -> list[T]: ...
#     def transform[R](self, fn: Callable[[T], R]) -> R: ...
```

### 2.5 常用泛型类型速查

| Java | Python (typing) | Python 3.12+ 内置 |
|------|-----------------|-------------------|
| `List<T>` | `list[T]` | `list[T]` |
| `Map<K,V>` | `dict[K, V]` | `dict[K, V]` |
| `Set<T>` | `set[T]` | `set[T]` |
| `Optional<T>` | `T \| None` | `T \| None` |
| `Function<T,R>` | `Callable[[T], R]` | `Callable[[T], R]` |
| `BiConsumer<T,U>` | `Callable[[T, U], None]` | 同上 |
| `Supplier<T>` | `Callable[[], T]` | 同上 |
| `Pair<A,B>` | `tuple[A, B]` | `tuple[A, B]` |
| `Stream<T>` | `Iterable[T]` / `Iterator[T]` | 同上 |
| `void` | `None` | `None` |

---

## 三、容器常见操作方法

### 3.1 List（列表）— 对应 Java 的 ArrayList

```python
# ──── 创建 ────
# Java:  new ArrayList<>(Arrays.asList(1, 2, 3))
nums: list[int] = [1, 2, 3]
zeros = [0] * 10                # [0,0,0,...] — 浅拷贝，对不可变对象安全
nested = [[0] * 3 for _ in range(3)]  # 二维数组，每行独立

# ──── 访问 ────
# Java:  list.get(0) / list.get(list.size()-1)
first = nums[0]                 # 1
last  = nums[-1]                # 3（负数索引从末尾开始）
sub   = nums[1:3]               # [2, 3] — 切片，左闭右开 [1, 3)

# ──── 增 ────
# Java:  add / addAll
nums.append(4)                  # [1,2,3,4]    在末尾追加
nums.insert(0, 0)               # [0,1,2,3,4]  在指定位置插入
nums.extend([5, 6])             # [0,1,2,3,4,5,6]  拼接

# ──── 删 ────
# Java:  remove(index) / remove(obj)
nums.pop()                      # 6  弹出并返回末尾元素
nums.pop(0)                     # 0  弹出并返回索引 0 的元素
nums.remove(3)                  # 删除第一个值为 3 的元素（按值删除）
del nums[1]                     # 按索引删除

# ──── 改 ────
nums[0] = 99

# ──── 查 ────
# Java:  contains / indexOf
3 in nums                       # True / False
nums.index(3)                   # 返回第一个 3 的索引，不存在抛 ValueError
nums.count(3)                   # 统计 3 出现的次数

# ──── 排序 ────
# Java:  Collections.sort / list.sort(Comparator)
sorted_list = sorted(nums)              # 返回新列表，原列表不变
sorted_desc = sorted(nums, reverse=True)
nums.sort()                             # 原地排序
nums.sort(key=lambda x: x % 10)         # 按个位数排序
nums.sort(key=abs, reverse=True)        # 按绝对值降序

# ──── 遍历 ────
for item in nums:                       # for-each
    print(item)

for i, item in enumerate(nums):         # 带索引
    print(f"{i}: {item}")

# ──── 列表推导（Python 最强特性之一）───
squares = [x ** 2 for x in range(10)]                    # [0,1,4,9,...,81]
evens   = [x for x in nums if x % 2 == 0]                # 只保留偶数
pairs   = [(x, y) for x in "AB" for y in "12"]          # 笛卡尔积

# Java 等价:  list.stream().map(x -> x*x).collect(toList())
#            list.stream().filter(x -> x%2==0).collect(toList())

# ──── 常用函数 ────
len(nums)           # 长度
sum(nums)           # 求和
min(nums) / max(nums)
any(x > 0 for x in nums)    # 是否有任一元素满足条件 → Java: anyMatch
all(x > 0 for x in nums)    # 是否全部满足 → Java: allMatch
```

### 3.2 Dict（字典）— 对应 Java 的 HashMap

```python
# ──── 创建 ────
# Java:  new HashMap<>()
d: dict[str, int] = {}
d = {"a": 1, "b": 2, "c": 3}
d = dict(a=1, b=2, c=3)            # 关键字参数方式
d = dict.fromkeys(["a", "b"], 0)    # {"a": 0, "b": 0}

# 字典推导
squares = {x: x**2 for x in range(5)}    # {0:0, 1:1, 2:4, 3:9, 4:16}

# ──── 增 / 改 ────
# Java:  put / putIfAbsent
d["d"] = 4                         # 直接赋值，存在则覆盖
d.setdefault("e", 5)               # 如果 "e" 不存在则设为 5，返回最终值

# ──── 删 ────
# Java:  remove
value = d.pop("a")                 # 删除 key 并返回值，不存在抛 KeyError
value = d.pop("z", 0)              # 删除 key，不存在返回默认值 0
del d["b"]                         # 删除 key，不存在抛 KeyError

# ──── 查 ────
# Java:  get / containsKey
"a" in d                           # True/False — 检查 key 是否存在
d.get("a")                         # 1 — 存在返回值
d.get("z")                         # None — 不存在返回 None（不抛异常）
d.get("z", 0)                      # 0 — 不存在返回默认值
d["a"]                             # 1 — 不存在则 KeyError

# ──── 遍历 ────
for key in d:                          # 遍历 key → Java: keySet()
    ...
for key, value in d.items():           # 遍历 key-value → Java: entrySet()
    ...
for value in d.values():               # 遍历 value → Java: values()
    ...

# ──── 合并 / 更新 ────
# Java:  putAll
d.update({"f": 6, "g": 7})        # 合并另一个字典
d.update(x=10, y=20)              # 关键字方式合并

# Python 3.9+ 合并运算符
d1 = {"a": 1, "b": 2}
d2 = {"b": 3, "c": 4}
merged = d1 | d2                   # {"a": 1, "b": 3, "c": 4} — 后者覆盖
d1 |= d2                           # d1 被原地更新

# ──── 其他常用操作 ────
# Java:  keySet / values / entrySet
d.keys()                           # dict_keys 视图（可迭代）
d.values()                         # dict_values 视图
d.items()                          # dict_items 视图 — [(key, value), ...]

# 获取嵌套字典的值（安全链式访问）
# from functools import reduce
# reduce(dict.get, ["a", "b", "c"], nested_dict)  # 不会因中间缺失而抛异常
```

### 3.3 Set（集合）— 对应 Java 的 HashSet

```python
# ──── 创建 ────
# Java:  new HashSet<>()
s: set[int] = {1, 2, 3, 4}
s = set([1, 2, 3, 3, 2, 1])       # {1, 2, 3} — 自动去重
empty: set[str] = set()             # 不能 {} — 那是空字典

# 集合推导
evens = {x for x in range(10) if x % 2 == 0}  # {0, 2, 4, 6, 8}

# ──── 基本操作 ────
s.add(5)                           # 添加元素
s.remove(1)                        # 移除，不存在抛 KeyError
s.discard(1)                       # 安全移除，不存在也不报错
x = s.pop()                        # 弹出任意元素（无序）
s.clear()                          # 清空

# ──── 集合运算 ────
a = {1, 2, 3, 4}
b = {3, 4, 5, 6}

a | b      # 并集 → {1,2,3,4,5,6}     Java: a.addAll(b) 或 union
a & b      # 交集 → {3,4}              Java: a.retainAll(b)
a - b      # 差集 → {1,2}              Java: a.removeAll(b)
a ^ b      # 对称差集 → {1,2,5,6}      不在两者交集中的元素

a |= b     # 原地并集
a &= b     # 原地交集
a -= b     # 原地差集

a.isdisjoint(b)    # 无交集？
a.issubset(b)      # a ⊆ b？
a.issuperset(b)    # a ⊇ b？

# ──── 不可变集合 ────
frozen = frozenset([1, 2, 3])      # 可哈希，可作 dict key — Java: Set.of / unmodifiable
```

### 3.4 Tuple（元组）— 不可变序列，Java 无直接对应

```python
# 类似 Java Record，但不需要定义类
point = (3, 4)
x, y = point            # 解包 → x=3, y=4

# 命名元组 — 轻量级的不可变 DTO
from collections import namedtuple
# 相当于 Java Record: record Point(int x, int y) {}
Point = namedtuple("Point", ["x", "y"])
p = Point(3, 4)
print(p.x, p.y)          # 3 4 — 字段访问
print(p[0], p[1])        # 3 4 — 也支持索引

# Python 3.10+: 结构化模式匹配
match point:
    case (0, 0):
        print("原点")
    case (x, 0):
        print(f"X 轴上的点，x={x}")
    case (0, y):
        print(f"Y 轴上的点，y={y}")
    case (x, y):
        print(f"坐标 ({x}, {y})")
```

### 3.5 Deque（双端队列）— 对应 Java 的 ArrayDeque

```python
from collections import deque

q: deque[int] = deque([1, 2, 3])

# 两端高效 O(1) 插入 / 删除
q.append(4)          # 右侧加 → [1,2,3,4]
q.appendleft(0)      # 左侧加 → [0,1,2,3,4]
q.pop()              # 右侧弹出 → 4
q.popleft()          # 左侧弹出 → 0

q.rotate(1)          # 右移一位 → [3,4,1,2]（原本 [1,2,3,4]）
q.rotate(-1)         # 左移一位

q.extend([5, 6])     # 右侧批量追加
q.extendleft([-2, -1])  # 左侧批量追加（注意：顺序反转）

# 适用场景：栈（LIFO）和队列（FIFO）都推荐用 deque，比 list 快
```

### 3.6 Collections 模块其他实用工具

```python
from collections import Counter, defaultdict, OrderedDict, ChainMap

# ── Counter: 计数器，等价于 Java 中 Map<T, Integer> 手动统计 ──
c = Counter("abracadabra")
print(c)                    # Counter({'a': 5, 'b': 2, 'r': 2, 'c': 1, 'd': 1})
print(c.most_common(2))     # [('a', 5), ('b', 2)]
c.update("aaa")             # 批量添加计数

# ── defaultdict: 访问不存在的 key 时自动初始化 ──
# 等价于 Java: computeIfAbsent + put
dd = defaultdict(list)      # 默认值是空 list
dd["a"].append(1)           # 不用先检查 "a" 是否存在！

dd2 = defaultdict(int)      # 默认值是 0
dd2["count"] += 1

# ── OrderedDict: 保持插入顺序 ──
# Python 3.7+ 普通 dict 也保序了，但 OrderedDict 多了一些方法
od = OrderedDict()
od.move_to_end("key")       # 移到末尾
od.popitem(last=False)      # FIFO 弹出

# ── ChainMap: 合并多个字典，优先查前面的 ──
defaults = {"color": "red", "size": "M"}
user = {"color": "blue"}
cm = ChainMap(user, defaults)
print(cm["color"])          # blue — 优先 user
print(cm["size"])           # M    — 回退到 defaults
```

### 3.7 Heap Queue（堆）

```python
import heapq

nums = [3, 1, 4, 1, 5, 9]
heapq.heapify(nums)              # 原地建堆 → 等价于 Java PriorityQueue
heapq.heappush(nums, 0)          # 插入
smallest = heapq.heappop(nums)   # 弹出最小
top3 = heapq.nlargest(3, nums)   # [9, 5, 4] — 最大的 3 个
bottom2 = heapq.nsmallest(2, nums)  # [1, 1] — 最小的 2 个
```

### 3.8 容器方法速查对照表

| 操作 | Java | Python |
|------|------|--------|
| 长度 | `list.size()` | `len(list)` |
| 判空 | `list.isEmpty()` | `not list` |
| 拼接 | `list1.addAll(list2)` | `list1 + list2` / `list1.extend(list2)` |
| 复制 | `new ArrayList<>(list)` | `list.copy()` / `list[:]` |
| 清空 | `list.clear()` | `list.clear()` |
| 反转 | `Collections.reverse(list)` | `list.reverse()` (原地) / `list[::-1]` (新) |
| 映射 | `stream().map().collect()` | `[f(x) for x in list]` |
| 过滤 | `stream().filter().collect()` | `[x for x in list if cond]` |
| 归约 | `stream().reduce()` | `functools.reduce(fn, list)` / `sum()` |
| 分组 | `Collectors.groupingBy()` | `itertools.groupby()` / 手动 dict |
| 排序 | `list.sort(Comparator)` | `list.sort(key=fn)` (原地) / `sorted(list, key=fn)` |
| 二分查找 | `Collections.binarySearch()` | `bisect.bisect_left(list, x)` |

---

## 四、快速对比总结

| 特性 | Java | Python |
|------|------|--------|
| 私有成员 | `private` 关键字，编译器强制 | `__name` 名称改写，约定基础 |
| 泛型 | `List<T>`，编译期检查，运行时擦除 | `list[T]`，仅类型注解，不强制 |
| 容器的"流" | `stream().map().filter().collect()` | 列表推导 `[f(x) for x in lst if cond]` |
| 不可变 | `Collections.unmodifiableList()` | `tuple()` / `frozenset()` |
| Map 默认值 | `computeIfAbsent(k, fn)` | `d.setdefault(k, v)` / `defaultdict` |
| 包可见性 | 有 | **无** — 全靠命名约定 `_name` |

> **核心理念差异**：Java 信赖编译器约束，Python 信赖程序员自律。"We're all consenting adults here" — Python 之禅。
