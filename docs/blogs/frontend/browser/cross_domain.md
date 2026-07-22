---
description: 💁 本文主要讲述浏览器中的跨域问题和同源策略相关知识。
title: 深入浏览器之跨域的本质
author: Bert
date: 2023-10-24
hidden: false
comment: true
sticky: 103
top: 103
recommend: 5
tag:
  - 前端
category:
  - 浏览器
---

# 深入浏览器之跨域的本质

## 跨域问题及解决方案

### CORS同源策略

浏览器中资源内容较为开放，但是浏览器并不自由。如果不控制，则会产生以下等问题：

<!-- <script></script> -->
1. XSS跨站脚本攻击（比如敌手在目标服务器的脚本代码中嵌入一个带弹窗的 script 标签）；
2. SQL注入攻击；
3. OS命令注入攻击；
4. HTTP首部注入攻击；
5. 跨站点请求伪造（CSRF）；

需要注意的是，其限制内容为：

1. 浏览器存储内容 ———— IndexedDB、Cookie、LocalStorage
2. DOM节点
3. AJAX相关请求（拦截）

主要为三个部分：DOM数据、WEB数据和网络

但是也有3个标签允许跨域资源加载：

```html
<img src=XXX>
<link href=XXX>
<script src=XXX>
```

一般的，如果两个 URL 的协议、主机和端口都相同，我们就称这两个 URL 同源。


### 如何在跨域下实现资源的请求等？

1. 使用JSONP利用script标签不被跨域限制的特点，获取从其他来源动态产生的资源信息。
> JSONP相比于AJAX，虽然都是客户端向服务端发送请求，从服务端获取数据。但是前者为非同源策略（跨域），后者为同源策略。
> JSONP简单且兼容性较好，可用于解决跨域数据资源请求失败的问题，但存在缺点：只支持get请求（不能post、put、patch、delete请求），容易遭受XSS攻击等。
> JSONP动态创建的节点需要删除，一般有两种方法：onload或complete时自动删除、暂不删除，积累到一定数量后删除（相当于延时处理）

2. 浏览器和后端同时支持CORS安全机制。在服务端设置 Access-Control-Allow-Origin 开启 CORS。该属性表示哪些域名可以访问资源，如果设置通配符则表示所有网站都可以访问资源。

> 简单请求————符合以下两个条件：
> 1. 请求方法为get、post、head
> 2. Content-Type 的值仅限下列三者之一：text/plain、multipart/form-data、application/x-www-form-urlencoded

> 如果不是简单请求的CORS请求，则需要在正式通信之前，使用OPTION方法


### 同源策略及跨域问题

**同源策略**是一套浏览器**安全机制**，当一个**源**的文档和脚本，与另一个**源**的资源进行通信时，同源策略就会对这个通信做出不同程度的限制。

简单来说，同源策略对 **同源资源** **放行**，对 **异源资源** **限制**

因此限制造成的开发问题，称之为**跨域（异源）问题**

#### 同源和异源

```
源(origin) = 协议 + 域名 + 端口
```

例如:

`https://study.duyiedu.com/api/movie`的源为`https://study.duyiedu.com`

`http://localhost:7001/index.html`的源为`http://localhost:7001`

两个URL地址的源**完全相同**，则称之为**同源**，否则称之为**异源（跨域）**

![image-20230112163455982](http://mdrs.yuanjin.tech/img/202301121634016.png)

#### 跨域出现的场景

跨域可能出现在三种场景：

- **网络通信**

  a元素的跳转；加载css、js、图片等；AJAX等等

- JS API

  `window.open`、`window.parent`、`iframe.contentWindow`等等

- 存储

  `WebStorage`、`IndexedDB`等等

对于不同的跨域场景，以及每个场景中不同的跨域方式，同源策略都有不同的限制。

本文重点讨论**网络通信**中`AJAX`的跨域问题

#### 网络中的跨域

当浏览器运行页面后，会发出很多的网络请求，例如CSS、JS、图片、AJAX等等

请求页面的源称之为**页面源**，在该页面中发出的请求称之为**目标源**。

当页面源和目标源一致时，则为**同源请求**，否则为**异源请求（跨域请求）**

![image-20230112163616513](http://mdrs.yuanjin.tech/img/202301121636551.png)

#### 浏览器如何限制异源请求？

浏览器出于多方面的考量，制定了非常繁杂的规则来限制各种跨域请求，但总体的原则非常简单：

- 对标签发出的跨域请求轻微限制
- 对AJAX发出的跨域请求**严厉限制**

![image-20230112201027855](http://mdrs.yuanjin.tech/img/202301122010888.png)

### 解决方案

#### CORS

CORS（Cross-Origin Resource Sharing）是最正统的跨域解决方案，同时也是浏览器推荐的解决方案。

CORS是一套规则，用于帮助浏览器判断是否校验通过。

![image-20230112202539003](http://mdrs.yuanjin.tech/img/202301122025029.png)

CORS的基本理念是：

- 只要服务器明确表示**允许**，则校验**通过**
- 服务器明确拒绝或没有表示，则校验不通过

**所以，使用CORS解决跨域，必须要保证服务器是「自己人」**

##### 请求分类

CORS将请求分为两类：**简单请求**和**预检请求**。

对不同种类的请求它的规则有所区别。

所以要理解CORS，首先要理解它是如何划分请求的。

###### 简单请求

> 完整判定逻辑：https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#simple_requests

简单来说，只要全部满足下列条件，就是简单请求：

- 请求方法是`GET`、`POST`、`HEAD`之一

- 头部字段满足CORS安全规范，详见 [W3C](https://fetch.spec.whatwg.org/#cors-safelisted-request-header)

  > 浏览器默认自带的头部字段都是满足安全规范的，只要开发者不改动和新增头部，就不会打破此条规则

- 如果有`Content-Type`，必须是下列值中的一个

  - `text/plain`
  - `multipart/form-data`
  - `application/x-www-form-urlencoded`

###### 预检请求(preflight)

只要不是简单请求，均为预检请求

###### 练习

```js
// 下面的跨域请求哪些是简单请求，哪些是预检请求

// 1
fetch('https://douyin.com');

// 2
fetch('https://douyin.com', {
  headers: {
    a: 1,
  },
});

// 3
fetch('https://douyin.com', {
  method: 'POST',
  body: JSON.stringify({ a: 1, b: 2 }),
});

// 4
fetch('https://douyin.com', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({ a: 1, b: 2 }),
});

// 简单请求：1、3；预检请求：2、4。
```

##### 对简单请求的验证

![image-20230112204546583](http://mdrs.yuanjin.tech/img/202301122045614.png)

浏览器在发送简单请求的时候，会在请求头中的Origin字段中，带上**当前请求资源所在页面的协议、域名和端口**，也就是当前页面源，或者说是站点。需要注意的是，Origin指向的URL中并没有路径和query。

注意：这部分知识点，有个面试题：Origin 和 Referer 字段之间的区别

> 扩展：
>
> 注意：Origin 是受保护字段，改不了。
>
> GET和HEAD请求并不会添加Origin请求头，而是在两种情况中会添加：
> 1. 同源请求中，POST、PUT、OPTIONS、PATCH、DELETE请求中都会添加Origin请求头。
> 2. 所有的跨域请求。

##### 对预检请求的验证

1. 发送预检请求（Host: crossdomain.com 首先发送一个预检请求，以获知服务器是否允许该实际请求）

![image-20230112204634493](http://mdrs.yuanjin.tech/img/202301122046532.png)

注意：这里的 Access-Control-Max-Age 是缓存最大时间，因此下次客户端在发送预检请求的时候，就不会说直接再次发送 OPTIONS 请求。

预检请求的作用：
1. 避免跨域请求对服务器的用户数据产生未预期的影响（其中的Options方法不会对服务器资源产生影响）；



2. 发送真实请求（和简单请求一致）

##### 细节1 - 关于cookie

默认情况下，ajax的跨域请求并不会附带cookie，这样一来，某些需要权限的操作就无法进行

不过可以通过简单的配置就可以实现附带cookie

```js
// xhr
var xhr = new XMLHttpRequest();
xhr.withCredentials = true;

// fetch api
fetch(url, {
  credentials: "include"
})
```

这样一来，该跨域的ajax请求就是一个*附带身份凭证的请求*

当一个请求需要附带cookie时，无论它是简单请求，还是预检请求，都会在请求头中添加`cookie`字段

而服务器响应时，需要明确告知客户端：服务器允许这样的凭据

告知的方式也非常的简单，只需要在响应头中添加：`Access-Control-Allow-Credentials: true`即可

对于一个附带身份凭证的请求，若服务器没有明确告知，浏览器仍然视为跨域被拒绝。

另外要特别注意的是：**对于附带身份凭证的请求，服务器不得设置 `Access-Control-Allow-Origin 的值为*`**。这就是为什么不推荐使用*的原因.

##### 细节2 - 关于跨域获取响应头

在跨域访问时，JS只能拿到一些最基本的响应头，如：Cache-Control、Content-Language、Content-Type、Expires、Last-Modified、Pragma，如果要访问其他头，则需要服务器设置本响应头。

`Access-Control-Expose-Headers`头让服务器把允许浏览器访问的头放入白名单，例如：

```
Access-Control-Expose-Headers: authorization, a, b
```

这样JS就能够访问指定的响应头了。

#### JSONP

在很久很久以前...并没有CORS方案

![image-20230112205454350](http://mdrs.yuanjin.tech/img/202301122054396.png)

在那个年代，古人靠着非凡的智慧来解决这一问题

![image-20230112205613983](http://mdrs.yuanjin.tech/img/202301122056031.png)

虽然可以解决问题，但JSONP有着明显的缺陷：

- 仅能使用GET请求

- 容易产生安全隐患

  > 恶意攻击者可能利用`callback=恶意函数`的方式实现`XSS`攻击

- 容易被非法站点恶意调用

**因此，除非是某些特殊的原因，否则永远不应该使用JSONP**

#### 代理

CORS和JSONP均要求服务器是「自己人」

那如果不是呢？

<img src="http://mdrs.yuanjin.tech/img/202301122105697.png" alt="image-20230112210551647" style="zoom:50%;" />

那就找一个中间人（代理）

![image-20230115133326930](http://mdrs.yuanjin.tech/img/202301151333985.png)

比如，前端小王想要请求获取王者荣耀英雄数据，但直接请求腾讯服务器会造成跨域

![image-20230115133732560](http://mdrs.yuanjin.tech/img/202301151337612.png)

由于腾讯服务器不是「自己人」，小王决定用代理解决

![image-20230115133817554](http://mdrs.yuanjin.tech/img/202301151338609.png)

#### 如何选择

最重要的，是要保持**生产环境和开发环境一致**

下面是一张决策图

![image-20230115145335319](http://mdrs.yuanjin.tech/img/202301151453393.png)

注意：当使用脚手架时，其中使用的构建工具 esbuilder/webpack 等时，会启动一个开发服务器 dev-server

具体的几种场景

![image-20230115150610750](http://mdrs.yuanjin.tech/img/202301151506803.png)

![image-20230115151406797](http://mdrs.yuanjin.tech/img/202301151514837.png)
开发服务器作为代理，转发请求


再去了解一下单点登录：cookie+session。这个存储方式有强控制力，能够保证大厂多用户时的风险。cookie 是字符串，session 是键值对。结合使用时，就是将 session 的键存储在 cookie 中。劣势的话，就是这样的话，服务器也得存储些东西，需要很大的存储空间。

但是小厂的话，他可能觉得没那么大风险，不需要这么高的安全性，只使用 token，服务器端不需要存储，只需要客户端存储。token 是分布式的。

----------------------------------------------------------------