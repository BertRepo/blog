---
title: CSS和CSS3
description: 💁 本文主要讲述web前端的基础知识：CSS。
author: Bert
date: 2021-10-31
hidden: false
comment: true
sticky: 1
top: 109
recommend: 12
tag:
  - 前端
category:
  - 前端三件套
---

# CSS和CSS3

## 选择器

1. id选择器

```html
<div id="demo"></div>

#demo {
    属性名:属性值;
}
```

2. class选择器

```html
<div class="container"></div>

.container {
    属性名:属性值;
}
```

3. 标签选择器

标签名 {
    属性名:属性值;
}

```html
<div></div>
div {
    属性名:属性值;
}
```

```html
<span></span>
span {
    属性名:属性值;
}
```

4. 通配符

*{
    属性名:属性值;
}

5. 属性选择器

[id] {
    属性名:属性值;
}

[id="demo"] {
    属性名:属性值;
}

[class] {
    属性名:属性值;
}

[class="demo"] {
    属性名:属性值;
}

6. 父子选择器/派生选择器

```html
<div><span>生效</span></div>
<span>不生效</span>

div span{
    background-color: red;
}
```

父子选择器，前面的div只是限定条件。
当然，前面的限定条件可以用任何选择器来替代，不是非要用上面的div这种标签选择器。
也不用直接关系，间接也可以，也就是儿孙都可以。

7. 直接子元素选择器
选择限定条件的下一级的子元素，也就是儿子。（孙子不符合条件）

div > em {

}

如上，添加了右尖角号。左右为真正的父子关系

8. 并列选择器
```html
<div>1</div>
<div class="demo">2</div>
<p class="demo">3</p>

div.demo {

}
```

注意：中间不加空格，精确描述某个元素

9. 分组选择器

降低代码冗余


练习：直接选中em

```html
<div class="wrapper">
    <div class="content">
        <em class="box" id="only">1</em>
    </div>
</div>

```
#only {}

.box {}

.content > em {}

.wrapper > .content > em {}

div.wrapper > div[class="content"] > div#only.box {}

## CSS中选择器和样式等优先级/权重比较

!important(infinity 正无穷) > 行间样式(1000) > id选择器(100) > class选择器｜属性选择器｜伪类选择器(10) > 标签选择器｜伪元素选择器(1) > 通配符(0)

**权重的计算 即是 将选择器对应的权重相加**

```html
<div id="demo1" class="demo2">
    <p id="demo3" class="demo4">3</p>
</div>
```

#demo1 p { id选择器 100 + 标签选择器 1
    background-color: red;
}

.demo2 .demo4 { class选择器 10 + class选择器 10
    background-color: green;
}

最终的颜色是红色

#demo1 p { id选择器 100 + 标签选择器 1
    background-color: red;
}

div .demo4#demo3 { 标签选择器 1 + class选择器 10 + id选择器 100
    background-color: green;
}

最终的颜色是绿色

#demo1 p.demo4 { id选择器 100 + 标签选择器 1 + class选择器 10
    background-color: red;
}

div .demo4#demo3 { 标签选择器 1 + class选择器 10 + id选择器 100
    background-color: green;
}

两个写法权重相同，按照后面的为准，最终的颜色是绿色



## 行级元素 块级元素

1. 行级元素、内联元素 inline

feature: 内容决定元素所占位置，不可以通过css改变宽高

常见行级元素: span strong em a del

其实是通过 display: inline; 控制元素行级


2. 块级元素 block

feature: 独占一行，可以通过css改变宽高

常见块级元素: div p ul li ol form address

通过 display: block; 控制元素块级

3. 行级块元素 inline-block

feature: 内容决定大小，可以通过css改变宽高

常见行块级元素: img

通过 display: inline-block; 控制元素行块级

> 有个小知识点：比如四个img标签

```html
<img src="https://fe-inner-1252328573.cos.ap-shanghai.myqcloud.com/237c6c83-740f-4399-aae1-824462682d35">
<img src="https://fe-inner-1252328573.cos.ap-shanghai.myqcloud.com/237c6c83-740f-4399-aae1-824462682d35">
<img src="https://fe-inner-1252328573.cos.ap-shanghai.myqcloud.com/237c6c83-740f-4399-aae1-824462682d35">
<img src="https://fe-inner-1252328573.cos.ap-shanghai.myqcloud.com/237c6c83-740f-4399-aae1-824462682d35">
```

> 图片中间会有间隙


## 知识点

### line-height 三种赋值方式有何区别

1. 带有单位的 line-height 会被计算成 px 后继承 。

2. 子元素的 line-height = 父元素的 line-height * font-size （如果是 px 了就直接继承）。

3. 而不带单位的 line-height 被继承的是倍数，子元素的 line-height = 子元素的 font-size * 继承的倍数 。

> line-height属性的细节

>+ 与大多数CSS属性不同，line-height支持属性值设置为无单位的数字。有无单位在子元素继承属性时有微妙的不同。

语法:

>+ line-height: normal 根据浏览器决定，一般为1.2。

>+ number 仅指定数字时（无单位），实际行距为字号乘以该数字得出的结果。可以理解为一个系数，子元素仅继承该系数，子元素的真正行距是分别与自身元素字号相乘的计算结果。大多数情况下推荐使用，可以避免一些意外的继承问题。

>+ length 具体的长度，如px/em等。

>+ percentage 百分比，100%与1em相同。

>+ 有单位（包括百分比）与无单位之间的区别有单位时，子元素继承了父元素计算得出的行距；无单位时继承了系数，子元素会分别计算各自行距（推荐使用）。


### 举例说明伪类:nth-child、:first-child与:first-of-type这三者有什么不同？

在CSS中，伪类:nth-child、:first-child和:first-of-type都是用于选择特定元素的，但它们之间有一些重要的区别。下面我会详细解释这三个伪类，并通过例子来说明它们之间的不同。

#### :nth-child(n)
:nth-child(n)伪类用于选择父元素中的第n个子元素。这里的n可以是一个具体的数字，也可以是一个公式（如2n、2n+1等），用于选择符合特定规律的子元素。

例如，li:nth-child(2)会选择每个ul或ol中的第二个li元素。而li:nth-child(2n)则会选择所有偶数位置的li元素。

```html
<ul>
  <li>Item 1</li> <!-- 不会被选中 -->
  <li>Item 2</li> <!-- 会被 li:nth-child(2) 选中 -->
  <li>Item 3</li> <!-- 不会被选中 -->
  <li>Item 4</li> <!-- 会被 li:nth-child(2n) 选中 -->
</ul>
```

#### :first-child
:first-child伪类用于选择父元素中的第一个子元素。这个伪类非常直接，只选择第一个子元素，不考虑元素的类型。

例如，li:first-child会选择每个ul或ol中的第一个li元素。

```html
<ul>
  <li>Item 1</li> <!-- 会被 li:first-child 选中 -->
  <li>Item 2</li> <!-- 不会被选中 -->
  <li>Item 3</li> <!-- 不会被选中 -->
</ul>
```

#### :first-of-type
:first-of-type伪类用于选择父元素中第一个特定类型的子元素。与:first-child不同，:first-of-type会考虑元素的类型。

例如，li:first-of-type会选择每个ul或ol中的第一个li元素，即使它不是列表中的第一个子元素（比如前面有其他的非li元素）。

```html
<ul>
  <div>Some other element</div> <!-- 不会被选中 -->
  <li>Item 1</li> <!-- 会被 li:first-of-type 选中，因为它是第一个 li 元素 -->
  <li>Item 2</li> <!-- 不会被选中 -->
</ul>
```


#### 总结

>+ :nth-child(n)通过位置来选择子元素，可以指定具体的数字或使用公式。
>+ :first-child直接选择第一个子元素，不考虑类型。
>+ :first-of-type选择第一个特定类型的子元素，即使它不是第一个子元素。