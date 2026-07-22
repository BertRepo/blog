---
description: 💁 本文主要讲述web前端的基础知识：Html。
title: Html和H5
author: Bert
date: 2021-10-26
hidden: false
comment: true
sticky: 4
top: 108
recommend: 10
tag:
  - 前端
category:
  - 前端三件套
---

# Html和H5

```html
<div></div>
<span></span>
```
功能：
结构化：给页面分块，充当容器
绑定化操作（比如：统一属性）

空格：文本分隔符
```html
html编码 &nbsp; 代表一个空格，实体格式为 &内容;（中间填充内容）
```




```html
<a href=""></a>
```

功能：
```html
<a href="https://github.com/">1、超链接</a>
<a href="#demo">2、锚点</a> <div id="demo"></div>
<a href="tel:18262638107">3、打电话</a>
<a href="mailto:18262638107@163.com">3、发邮件</a>
<a href="javascript:while(1){alert('让你手欠')}">4、协议限定符</a>
```



```html
<form method="get/post" action="http://模拟后端地址">
    用户名：<input type="text" name="username" value="请输入用户名" onfocus="if(this.value==''){this.value=''}" onblur="if(this.value==''){this.value='请输入用户名'}">
    密码：<input type="password" name ="pwd">
    发送信息：<input type ="submit">

    
    单选框：
    a<input type="radio" name="star" value="1">
    b<input type="radio" name="star" value="2">
    c<input type="radio" name="star" value="3">

</form>

<!-- form元素自带enter后发起请求等功能，因此，当不想使用默认的发送请求功能时，可以在script中这样写： -->
<script>
  const form = document.querySelector('form');
  form.onsubmit = (e) => {
    e.preventDefault(); // 阻止默认事件
    console.log('submit');
  }
</script>
```