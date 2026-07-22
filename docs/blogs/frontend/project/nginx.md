---
title: Nginx 配置与使用指南
description: 💁 前端工程师必备的 Nginx 知识：安装、配置文件结构、反向代理、负载均衡、gzip、缓存、HTTPS 与静态站点部署实战。
author: Bert
date: 2021-10-31
tag:
  - 后端
  - Nginx
---

## 事件驱动模型:Nginx 高并发的根因

Nginx 单机扛数万并发的秘密不在"配置技巧",而在架构。要读懂 Nginx,必须先理解它的进程模型与 IO 模型,这是后面所有指令调优的底层依据。

### master + worker 多进程架构

Nginx 启动后以两类进程运行:

- **master 进程**:仅 1 个,以 root 启动,职责是读取校验配置、绑定监听端口(80/443 等小于 1024 的端口需 root)、fork 并管理 worker、响应外部信号(`reload`/`reopen`)、支持二进制热升级。master 不处理业务请求。
- **worker 进程**:N 个,由 master fork 后降权到非特权用户(如 `www-data`)运行,真正接收连接、处理请求。worker 间相互独立,某个崩溃 master 会立即重新 fork 补上,服务不中断。

```nginx
# 全局块
worker_processes auto;        # worker 数,auto = CPU 核心数
worker_rlimit_nofile 65535;   # 单 worker 可打开的最大 fd 数(需配合 ulimit)

events {
    worker_connections 10240; # 单 worker 最大并发连接数
    use epoll;                # Linux 显式指定 epoll 事件模型
    multi_accept on;          # 一次 accept 收割所有就绪连接
}
```

### 单线程 Reactor:worker 如何处理海量连接

关键点:每个 worker 是**单线程**的,但它用 epoll 实现了**非阻塞 IO + 事件循环**(Reactor 模式)。一个 worker 线程同时挂着几万条连接,工作流程大致是:

1. epoll 注册监听 socket 的读事件(新连接到来 / 数据到达)。
2. 线程阻塞在 `epoll_wait`,有事件就绪时内核返回就绪 fd 列表。
3. 对每个就绪 fd 调用非阻塞的 `recv`/`send`,一次只读/写一小段,没读完就再次注册事件,等下一轮 epoll_wait。
4. 处理完一个事件立刻回到 `epoll_wait`,绝不阻塞在单个连接上。

这种"事件来了处理一点、立刻切换"的方式,让单线程也能并发数万连接。绝大多数时间连接是空闲的(等客户端发数据、等后端响应),阻塞 IO 模型下线程会傻等,而 epoll 让线程只在"有事可做"时才被唤醒。对比 Apache prefork:

| 维度 | Apache prefork | Nginx worker |
| --- | --- | --- |
| 模型 | 一个连接一个进程 | 一个进程处理 N 个连接 |
| 进程/线程数 | 与并发数 1:1 | 与并发数 M:N |
| 内存占用 | 每进程 5-10MB,千并发 5GB+ | 每 worker 几 MB,千并发几十 MB |
| 上下文切换 | 进程切换开销大 | 单线程无切换,事件驱动 |
| 阻塞处理 | 同步阻塞 | 非阻塞 + epoll |

prefork 模型下 10000 并发需要 10000 个进程,光进程切换和内存就把机器压垮;Nginx 用 8 个 worker 各挂 10000+ 连接,内存占用不到 200MB。这就是 C10K 问题被 Nginx 轻松跨越的根本原因。

### 最大并发数的计算

理论最大并发 = `worker_processes × worker_connections`,但有两个修正:反向代理场景下每个客户端连接占用 Nginx 侧**两条**连接(一端客户端、一端后端),实际并发上限 ≈ `worker_processes × worker_connections / 2`;纯静态资源不走 proxy 则无此问题。此外还受系统 `ulimit -n`(进程最大 fd)和 `fs.file-max`(全局 fd)限制,需同步调高。

```bash
ulimit -n              # 查看当前进程 fd 上限
ulimit -n 65535        # 临时调高(永久生效写 /etc/security/limits.conf)
```

8 核机器配 `worker_connections 10240`,反代场景理论可扛 `8 × 10240 / 2 = 40960` 并发。

## HTTP 请求处理的 11 个阶段

Nginx 处理一个 HTTP 请求不是一坨代码走到底,而是被切成**有序的 11 个阶段(phase)**,每个阶段挂载对应的模块。理解阶段能解释很多"为什么这条指令先于那条生效"的疑问。

| 阶段 | 模块/指令示例 | 作用 |
| --- | --- | --- |
| 1. post-read | `realip` | 读取请求头后,修正客户端真实 IP(从 X-Forwarded-For 取) |
| 2. server-rewrite | `rewrite`(server 块内) | server 级别的 URL 重写 |
| 3. find-config | 内置 | 根据 Host + URI 定位到具体 `location` 块 |
| 4. rewrite | `rewrite`(location 块内) | location 级别的 URL 重写 |
| 5. post-rewrite | 内置 | 处理 rewrite 产生的内部跳转,决定是否重新走 find-config |
| 6. preaccess | `limit_req` `limit_conn` | 访问前置检查:限流、连接数限制 |
| 7. access | `allow` `deny` `auth_basic` | 权限校验 |
| 8. post-access | 内置 | 配合 `satisfy` 处理 access 阶段的组合结果 |
| 9. precontent | `try_files` `mirror` | 内容生成前的预处理,try_files 在这里 |
| 10. content | `proxy_pass` `root` `index` `return` | 真正生成响应内容 |
| 11. log | `access_log` | 记录访问日志 |

几个关键认知:

- **rewrite 在 access 之前**:rewrite 触发的重定向先于权限校验,被重写后的 URI 才进入 access。
- **limit_req 在 access 之前**:限流是第一道闸,在权限校验前把恶意流量挡掉。
- **try_files 在 content 之前**:找不到文件时触发**内部重定向**,把请求重新交给 content 阶段(典型:回退 `index.html`)。
- **content 阶段互斥**:同一 location 里 `proxy_pass`、`root`、`return` 都是 content 阶段模块,后者覆盖前者,不要混用。

## 配置指令的继承与上下文

Nginx 配置是嵌套的树结构:`http` > `server` > `location`。指令分两类,继承行为不同:

- **普通指令**(如 `root`、`index`、`client_max_body_size`):子上下文继承父上下文的值,子块重新声明则覆盖。
- **数组类指令**(如 `proxy_set_header`、`add_header`、`rewrite`):子块一旦重新声明,**整个数组被替换**,不叠加。这是最隐蔽的坑。

```nginx
server {
    add_header X-Frame-Options DENY;        # server 级声明

    location /a {
        # 继承,响应头有 X-Frame-Options
        proxy_pass http://backend;
    }

    location /b {
        add_header X-Content-Type-Options nosniff;  # 这里重新声明 add_header
        # 坑:X-Frame-Options 丢了!整个 add_header 数组被替换
        proxy_pass http://backend;
    }
}
```

`/b` 路径下要保留两个头,必须显式重写两条,这个坑在加安全头时高发。

### server_name 匹配优先级

一个端口(如 80)可以配多个 server,Nginx 收到请求后按 Host 头匹配 server_name,优先级从高到低:

1. **精确匹配**:`server_name example.com;`
2. **通配符开头**:`server_name *.example.com;`(匹配 `www.example.com`、`api.example.com`)
3. **通配符结尾**:`server_name example.*;`(匹配 `example.com`、`example.cn`)
4. **正则匹配**:`server_name ~^www\d+\.example\.com$;`(`~` 开头,按配置顺序)
5. 都不命中,走 `default_server`(listen 后声明)或该端口第一个 server。

```nginx
server {
    listen 80 default_server;          # 兜底,匹配不到任何 server_name 时走这里
    server_name _;                     # _ 是个无效域名,常用于 default 占位
    return 444;                        # 直接断开连接,拒绝非法 Host
}

server {
    listen 80;
    server_name example.com;            # 精确,优先级最高
}

server {
    listen 80;
    server_name *.example.com;          # 通配符开头
}
```

## location 匹配:深水区

location 匹配是 Nginx 配置里最容易写错的地方。四种前缀加普通前缀,优先级算法不是简单的"从上到下"。

### 四种前缀的含义

| 前缀 | 写法 | 类型 | 说明 |
| --- | --- | --- | --- |
| `=` | `location = /path` | 精确匹配 | URI 必须完全等于 /path,命中即停 |
| `^~` | `location ^~ /static/` | 前缀匹配(停止正则) | 命中后不再检查正则 location |
| `~` | `location ~ \.php$` | 正则(区分大小写) | 按配置文件中出现的顺序匹配 |
| `~*` | `location ~* \.(js\|css)$` | 正则(不区分大小写) | 同上 |
| 无 | `location /api/` | 普通前缀 | 记最长匹配,但不立即生效 |

### 匹配算法(关键)

Nginx 收到请求后,location 匹配的完整流程:

1. 先在所有**普通前缀 location**(无前缀和 `^~`)里找最长匹配,记录下来。
2. 如果最长匹配是 `=` 精确命中,直接用,停止。
3. 如果最长匹配带 `^~`,直接用,跳过正则。
4. 否则,按配置顺序逐个尝试**正则 location**,第一个命中的就用。
5. 正则都没命中,回退到第 1 步记录的最长普通前缀。

注意第 1 步是"记下来但不一定用",正则有更高优先级(除了 `=` 和 `^~`)。这是最容易搞错的点。

### 用例子讲透

```nginx
location = /favicon.ico {          # A: 精确
    return 204;
}
location ^~ /static/ {             # B: 前缀 + 停止正则
    alias /var/www/files/;
}
location ~* \.(js|css)$ {          # C: 正则
    expires 1y;
}
location /static/js/ {             # D: 普通前缀
    add_header X-Type js;
}
location / {                       # E: 普通前缀(最短)
    proxy_pass http://backend;
}
```

逐个请求验证:

- `/favicon.ico` -> A 精确命中,立即返回 204。
- `/static/app.js` -> 普通前缀 B(`/static/`)和 D(`/static/js/`)都匹配,但 D 不带 `^~`,继续查正则:C 命中(`.js`),最终走 C 带 `expires 1y`。
- `/static/img/logo.png` -> 普通前缀最长是 B(`/static/`),B 带 `^~` 停止查正则,走 B。
- `/api/users` -> 普通前缀只有 E(`/`)匹配,无正则命中,走 E。

看出陷阱没?`/static/js/app.js` 你以为走 D(最长前缀),实际被正则 C 截胡。要让 D 生效,改写为 `^~ /static/js/` 或把正则写得更严格。"正则优先于普通前缀"是为了让灵活正则覆盖宽泛前缀。

## root vs alias:路径拼接的两种语义

这两个指令都把 URL 映射到文件系统路径,语义不同,是 404 高发区。

### root:拼接

`root` 把**完整 URI**(含 location 匹配部分)拼到 root 路径后。

```nginx
# 请求 /static/a.js
location /static/ {
    root /var/www;        # 查找:/var/www + /static/a.js = /var/www/static/a.js
}
```

### alias:替换

`alias` 把 location 匹配到的部分**替换**为 alias 路径。

```nginx
# 请求 /static/a.js
location /static/ {
    alias /var/www/files/;  # 查找:/var/www/files/ + a.js = /var/www/files/a.js
}
```

### 三大陷阱

1. **alias 必须带尾斜杠**:当 location 以斜杠结尾时,alias 也必须以斜杠结尾,否则路径错位。 <Badge text="易错" type="danger" />
   ```nginx
   location /static/ {
       alias /var/www/files;     # 错!查找:/var/www/filesa.js
   }
   location /static/ {
       alias /var/www/files/;    # 对,查找:/var/www/files/a.js
   }
   ```

2. **正则 location 用 alias 需要捕获组**:正则 location 里 alias 路径要引用 `$1`、`$2` 把匹配部分接上。
   ```nginx
   location ~ ^/static/(.*)$ {
       alias /var/www/files/$1;   # /static/a.js -> /var/www/files/a.js
   }
   ```

3. **root 路径不要带尾斜杠**:多数情况容错,但不规范,与 alias 混用时易混淆。

记忆口诀:**root 拼、alias 换;alias 带杠、root 不带**。排查 404 时直接看 `error.log` 里 Nginx 实际查找的路径,对照规则一验便知。

## try_files 与 SPA 路由回退

前端 SPA(Vue Router / React Router 的 history 模式)刷新 `/user/123` 会 404,因为服务器上没有这个文件。`try_files` 是标准解法。

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

`try_files` 的查找顺序:从左到右逐个检查,找到就交给 content 阶段,全部找不到用最后一个作 fallback(触发**内部重定向**,重新走 location 匹配)。`$uri` 尝试当文件查(`/user/123` 查 `/var/www/dist/user/123`),`$uri/` 尝试当目录查(配合 `index` 找目录下 index.html),`/index.html` 是前两者都 miss 时的兜底--内部重定向到 `/index.html`,重新匹配 location 命中最外层 `/`,返回 `index.html` 交给前端路由接管。

### SPA 完整部署配置

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/my-app/dist;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 带 hash 的静态资源:一年强缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # index.html 禁止强缓存,保证发版后用户拿到新入口
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

前端打包产物里,文件名带 hash(`app.a3f9b.js`)内容不变 hash 不变,可一年强缓存;`index.html` 是入口每次都要拉最新,否则发版后用户看到的是旧壳子加载旧 hash 的 JS。

## 反向代理 proxy_pass:URL 替换的两种语义

`proxy_pass` 是前端联调最常用的指令,尾斜杠决定路径是否被替换,这是最隐蔽的坑。

### 带 URI(含斜杠或路径):替换

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/;   # 带尾斜杠
}
# 请求 /api/users -> 转发到 http://127.0.0.1:3000/users(/api/ 被替换为 /)
# 若写 http://127.0.0.1:3000/backend/ -> http://127.0.0.1:3000/backend/users
```

### 不带 URI:保留

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;   # 不带斜杠
}
# 请求 /api/users -> http://127.0.0.1:3000/api/users
# 完整 URI 原样透传
```

规则:**proxy_pass 带 URI 就替换 location 匹配部分,不带就原样转发**。 <Badge text="注意" type="warning" /> 配之前务必想清楚后端期望收到什么路径。

### proxy_pass 与变量:行为变体

当 proxy_pass 的值含变量(如 `$backend`、`$request_uri`)时,Nginx 不做 URI 替换,需显式构造完整 URL:

```nginx
location /api/ {
    proxy_pass http://$backend$request_uri;   # 含变量,必须显式拼 URL
}
```

这种场景下"带不带斜杠"的替换规则失效,容易踩坑。

### 代理头透传

反向代理时,后端拿到的请求是 Nginx 发出的,默认丢失客户端真实信息,必须透传关键头:

```nginx
location /api/ {
    proxy_pass http://backend;

    proxy_set_header Host              $host;             # 原始 Host
    proxy_set_header X-Real-IP         $remote_addr;      # 客户端真实 IP
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;  # 代理链
    proxy_set_header X-Forwarded-Proto $scheme;           # 原始协议

    # WebSocket 支持(协议升级)
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";

    # 超时
    proxy_connect_timeout 5s;
    proxy_read_timeout    60s;
    proxy_send_timeout    60s;
}
```

| 头 | 作用 |
| --- | --- |
| `Host` | 透传原始 Host,否则后端拿到的是 upstream 名或 IP |
| `X-Real-IP` | 客户端真实 IP,后端做风控/日志取这个 |
| `X-Forwarded-For` | 代理链路 IP,多层代理叠加,逗号分隔 |
| `X-Forwarded-Proto` | 原始协议,后端用它生成正确的回调/重定向 URL |

## upstream 与负载均衡

单台后端扛不住时,用 `upstream` 把请求分发到多台实例。

### 负载均衡算法

| 算法 | 配置 | 原理 | 适用场景 |
| --- | --- | --- | --- |
| 轮询(默认) | 无需额外配置 | 按顺序轮流派发 | 实例性能相当、无状态 |
| 权重 | `server a weight=3;` | 按权重比例分配 | 实例配置有差异 |
| ip_hash | `ip_hash;` | 按客户端 IP 哈希固定到某台 | 需会话粘滞 |
| least_conn | `least_conn;` | 派给当前活跃连接最少的 | 请求处理时长差异大 |
| 一致性哈希 | `hash $request_uri consistent;` | 按 key 哈希到哈希环 | 缓存场景,减少节点变动迁移 |

```nginx
upstream backend {
    # ip_hash;                          # 启用 ip_hash 会话粘滞
    least_conn;                         # 或用最小连接

    server 127.0.0.1:3000 weight=3;     # 承担 3/5 流量
    server 127.0.0.1:3001 weight=2;
    server 127.0.0.1:3002 backup;       # 备用,主节点全挂才启用
    server 127.0.0.1:3003 down;         # 标记下线,不参与分发

    keepalive 32;                       # 到后端的长连接池,复用 TCP
}

server {
    location /api/ {
        proxy_pass http://backend;       # 引用 upstream,不带路径
        proxy_http_version 1.1;          # 长连接需要 HTTP/1.1
        proxy_set_header Connection "";  # 清空 Connection 头,启用复用
    }
}
```

### 健康检查

- **被动检查**(内置):某节点返回失败或超时,Nginx 标记不可用,`max_fails` 次失败内剔除,过 `fail_timeout` 后重试。
  ```nginx
  server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;   # 30s 内失败 3 次则剔除 30s
  ```
- **主动检查**(商业版 nginx_plus 或第三方 `nginx_upstream_check_module`):周期性发健康探针主动剔除异常节点,开源版只能被动检查。

## 性能优化:压缩、缓存、传输、限流

### gzip 与 brotli

文本资源压缩可降到原体积 1/4 ~ 1/3,首屏提升大。

```nginx
gzip on;
gzip_vary on;                       # 响应头加 Vary: Accept-Encoding
gzip_proxied any;                   # 对代理请求也压缩
gzip_comp_level 6;                  # 压缩级别 1-9,6 性价比最高
gzip_min_length 1k;                 # 小于 1KB 不压缩,省 CPU
gzip_types
    text/plain text/css text/xml
    application/json application/javascript
    application/xml+rss text/javascript
    image/svg+xml;
```

Brotli 压缩率比 gzip 高 15-25%(尤其文本),需第三方模块 `ngx_brotli`,且浏览器只在 HTTPS 下声明支持:

```nginx
brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css application/javascript application/json image/svg+xml;
```

不要压缩 jpg/png/webp(已是压缩格式)和已 gzip 字体,二次压缩浪费 CPU 还可能变大。

### 缓存层级

浏览器缓存分两类:**强缓存**(`Cache-Control: max-age`,期内直接用本地副本不发请求,返回 200 from cache)和**协商缓存**(`ETag`/`Last-Modified`,发请求问服务器,没变返回 304)。

```nginx
# 带 hash 的资源:一年强缓存
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";   # immutable 防止用户刷新时重新验证
}

# index.html:协商缓存
location = /index.html {
    add_header Cache-Control "no-cache";   # 每次都问,304 协商
}
```

中间还有一层**代理缓存**(CDN 或 Nginx 自身 `proxy_cache`),可在 Nginx 缓存后端响应:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m
                 max_size=1g inactive=60m use_temp_path=off;

location /api/ {
    proxy_cache api_cache;
    proxy_cache_valid 200 10m;        # 200 响应缓存 10 分钟
    proxy_cache_valid 404 1m;
    proxy_cache_key "$scheme$host$request_uri";
    add_header X-Cache-Status $upstream_cache_status;   # HIT/MISS/EXPIRED
}
```

### sendfile 与 tcp_nopush

```nginx
sendfile on;         # 零拷贝:内核直接把文件从 page cache 送到 socket,绕过用户态
tcp_nopush on;       # 配合 sendfile,把响应头和文件首块合并发送,减少 TCP 包数
tcp_nodelay on;      # 禁用 Nagle,小包立即发送(长连接交互场景)
```

`sendfile` 对静态资源提升最大:传统 `read/write` 要 4 次上下文切换 + 2 次拷贝,`sendfile` 用 DMA 把文件直接送到 socket,只剩 2 次切换;`tcp_nopush` 让 Nginx 攒够一个 MSS 再发,减少小包。

### 限流 limit_req:漏桶算法

`limit_req` 基于**漏桶算法**:请求以固定速率"漏出"被处理,超出的排队或丢弃。

```nginx
# 定义:按 IP 限流,10MB 共享内存,速率 10 请求/秒
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
    location /api/ {
        # burst=20:允许 20 个突发请求排队
        # nodelay:突发请求不延迟,超过 burst 才直接 503
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

- `rate=10r/s`:每秒 10 个请求通过,即每 100ms 一个。
- `burst=20`:允许 20 个突发请求排队(漏桶容量)。
- `nodelay`:排队请求立即处理不延迟,超过 burst 容量直接 503;不加则按 rate 速率延迟处理,可能堆积。

按 IP 限流用 `$binary_remote_addr` 而非 `$remote_addr`,前者每个 IPv4 仅占 4 字节,10MB 能记约 250 万 IP。

### buffer 调优

```nginx
client_body_buffer_size 16k;       # 客户端请求体缓冲,超了写临时文件
client_max_body_size 20m;          # 上传文件大小上限,超了 413
proxy_buffering on;                # 代理响应先缓冲再发给客户端
proxy_buffer_size 4k;              # 响应头缓冲
proxy_buffers 8 4k;                # 响应体缓冲,8 个 4KB 块
```

`client_max_body_size` 默认仅 1MB,上传场景要调大,否则传文件就 413。

## HTTPS 深入:TLS 握手、会话复用、HTTP/2

### TLS 握手简述

HTTPS = HTTP over TLS。一次完整 TLS 1.2 握手要 2 个 RTT:ClientHello(客户端发支持的 TLS 版本、密码套件、随机数)-> ServerHello + 证书 + 密钥交换参数 -> 客户端验证证书、生成预主密钥、切换加密 -> 服务端切换加密完成。TLS 1.3 压缩到 1 个 RTT 并支持 0-RTT(会话恢复时)。握手开销是 HTTPS 比 HTTP 慢的主因,所以**会话复用**很关键。

### session resumption 会话复用

复用已建立的 TLS 会话,跳过完整握手:

```nginx
ssl_session_cache shared:SSL:10m;     # 共享内存缓存,10MB 约 4 万会话
ssl_session_tickets on;               # 用 ticket(加密票据)复用,无状态
ssl_session_timeout 1d;               # 会话缓存有效期
```

两种机制:**session id**(服务端缓存会话,客户端带 id 复用,占内存)和 **session ticket**(服务端把会话加密成 ticket 发给客户端带回,无状态,需保管好加密密钥)。

### OCSP stapling

客户端验证证书时要查 CA 的 OCSP(在线证书状态)接口确认证书未吊销,这增加一次外部请求和延迟。OCSP stapling 让 Nginx 主动去查并"装订"到握手响应里:

```nginx
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 valid=300s;          # OCSP 查询需要 DNS 解析
resolver_timeout 5s;
```

既加快握手(客户端不用自查),又避免隐私泄露(客户端不用向 CA 暴露访问的站点)。

### HTTP/2 多路复用

HTTP/2 在一个 TCP 连接上并发多个请求/响应(流),解决 HTTP/1.1 的队头阻塞:

```nginx
listen 443 ssl http2;                 # 一行启用
http2_max_concurrent_streams 128;     # 单连接最大并发流
```

HTTP/2 要求 HTTPS(浏览器强制),必须先配好证书。多路复用让"打包单 bundle 还是分片加载"的争论失去意义--并发流足够多,小文件并行加载反而更快。HTTP/3(QUIC)基于 UDP 彻底解决 TCP 层队头阻塞,需 Nginx 1.25+ 启用 QUIC,生产可用但部署率低。

### HTTPS 完整配置

```nginx
# HTTP 跳 HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;   # 301 永久重定向
}

# HTTPS 站点
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;          # 只允许现代协议
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_tickets on;
    ssl_session_timeout 1d;
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 valid=300s;

    # HSTS:强制浏览器后续都走 HTTPS,防降级攻击
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    root /var/www/my-app/dist;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`return 301 https://$host$request_uri;` 比 `rewrite` 更清晰高效,官方推荐。HSTS 头让浏览器一年内强制 HTTPS,防 SSL Strip 降级攻击,生产站点必加。

Let's Encrypt + certbot 自动申请续期:

```bash
sudo certbot --nginx -d example.com -d www.example.com   # 自动改写配置并加跳转
sudo certbot renew --dry-run                              # 测试续期
```

## 避坑清单

1. **404 排查**:看 `error.log` 里 Nginx 实际查找的文件路径,对照 `root`/`alias` 拼接规则;SPA 别忘 `try_files` 回退 `index.html`。
2. **403 排查**:三件事--目录缺 `index` 且没开 `autoindex`;文件权限不足(worker 用户读不到);目录缺执行权限(`chmod +x`)。`error.log` 会写 "directory index is forbidden" 或 "Permission denied"。
3. **reload vs restart**:`reload` 平滑重载,旧 worker 处理完存量请求后退出不中断;`systemctl restart` 断开所有连接。线上永远用 `reload`,且 reload 失败(配置错误)时旧配置仍在跑不会宕机,比 restart 安全。
4. **配置改完先 `-t`**:`nginx -t` 1 秒验证语法,`nginx -T` 打印合并后完整配置(排查 include 神器)。 <Badge text="提示" type="tip" />
5. **add_header 数组替换**:子 location 重写 `add_header` 会丢父级所有 add_header,安全头要重写一遍。
6. **proxy_pass 尾斜杠**:带 URI 替换,不带保留,配前想清楚后端要的路径。
7. **include 顺序**:`conf.d/*.conf` 多个 server 合并到同一 http 块,`server_name` 别冲突,否则请求落错 server。
8. **worker 用户权限**:worker 默认 `nobody`/`www-data`,读不到 root 用户文件就 403,把站点目录 `chown -R www-data:www-data`。
9. **变量插值陷阱**:`proxy_pass` 含变量时不做 URI 替换,需显式拼 URL;前端模板字面量如 `<code v-pre>{{ }}</code>` 在构建工具配置里注意别与 Nginx 的变量插值语法混淆。

## 结语

Nginx 的高并发不是"调参调出来的",而是事件驱动加非阻塞 IO 架构的必然结果。理解 master/worker + epoll,才能看懂为什么 `worker_processes × worker_connections` 是并发上限;理解 11 个请求处理阶段,才能解释为什么 `rewrite` 先于 `limit_req`、`try_files` 能触发内部重定向;理解 location 匹配的"正则优先于普通前缀"算法,才能写出不踩坑的路由规则。

把这些底层原理吃透,日常部署 80% 的 Nginx 问题都能秒定位。高频指令就那二十几个,把每个指令的语义和所处阶段搞清楚,远比背全量指令表高效。
