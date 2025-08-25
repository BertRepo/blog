# 什么是发布-订阅模式？

发布-订阅模式其实是一种对象间一对多的依赖关系，当一个对象的状态发生改变时，所有依赖于它的对象都将得到状态改变的通知。

*   **订阅者**（Subscriber）：把自己想订阅的事件 注册 到**调度中心**
*   当**发布者** 发布该事件到调度中心，也就是该事件触发时，由 **调度中心** 统一调度**订阅者**注册到**调度中心**的处理代码

# 手写发布订阅模式

发布订阅模式，他的核心内容只有四个：

1.  缓存列表  message
2.  向消息队列中添加 订阅事件 \$on
3.  删除消息队列的 订阅事件  \$off
4.  触发消息队列的 订阅事件  \$emit

## 创建一个 Observer 类

我们先创建一个 Observer 类

    class Observer {

    }

在 Observer 类里，需要添加一个构造函数：

    class Observer {
      constructor() {
      
      }
    }

## 添加三个核心方法

还需要添加三个方法，也就是我们前面讲到的 on、emit、off 方法，为了让这个方法长得更像 Vue，我们需要在这几个方法前面都加上 \$，即

*   向消息队列中添加 订阅事件 \$on
*   删除消息队列中的 订阅事件 \$off
*   触发消息队列中的 订阅事件 \$emit

<!---->

    class Observer{
      constructor() {
      
      }
      
      //向消息队列中添加  订阅事件
      $on() {}
      
      //删除消息队列中的  订阅事件
      $off() {}
      
      //触发消息队列中的 订阅事件
      $emit() {}
    }

### 设置缓存列表

我们前面所讲到的**缓存列表**（**消息队列**），即是**调度中心**了。

    class Observer {
      constructor() {
        this.message = {}			//消息队列
      }
      
    }

### 实现 \$on 方法

给 \$on() 方法传入两个参数：

*   type：事件名（事件类型）
*   callback：回调函数

<!---->

1.  在添加 **订阅事件** 之前，我们需要判断 **消息队列** 中，是否已经存在该 ***订阅事件***。
2.  如果没有这个属性，就初始化一个**空的数组**
3.  如果有这个属性，就它的后面push一个 新的 **callback**。

<!---->

    class Observer {
      constructor() {
        this.message = {};
      }
      
      $on(type, callback) {
        if(!this.message[type]) {
          this.message[type] = [];
        }
        
        this.message[type].push(callback);
      }
      
      $off() {}
      
      $emit() {}
      
    }

### 实现 \$off 方法

**\$off** 方法用来删除消息队列里的内容

*   **\$off(type)** ：表示删除整个 **type** 事件
*   **\$off(type, callback)** ：表示删除 **type** 事件中的某个消息

<!---->

    class Observer {
      constructor() {
        this.message = {};
      }
      
      $on(type, callback) {
        if(!this.message[type]) {
          this.message[type] = [];
        }
        this.message[type].push(callback);
      }
      
      
      $off(type, callback) {
        if(!this.message[type]) return;
        if(!callback) this.message[type] = undefined
        
        this.message[type] = this.message[type].filter(item => item !== callback);
      }
    }

### 实现 \$emit 方法

**\$emit** 用来触发消息队列里的内容：

*   该方法需要传入一个 type 参数，用来确定哪一个事件
*   主要流程就是对这个 type 事件做一个轮询（for循环），挨个执行每一个消息的回调函数 callback 就可以了

<!---->

    class Observer {
      constructor() {
        this.message = {};
      }
      
      $on(type, callback) {
        if(!this.message[type]) {
          this.message[type] = [];
        }
        this.message[type].push(callback);
      }
      
      
      $off(type, callback) {
        if(!this.message[type]) return;
        if(!callback) this.message[type] = undefined
        
        this.message[type] = this.message[type].filter(item => item !== callback);
      }
      
      $emit(type) {
        if(!this.message[type]) return
        
        this.message[type].forEach((item) => {
          item();
        })
      }
    }

### 案例使用

     class Observer {
            constructor() {
                this.message = {};
            }

            $on(type, callback) {
                if(!this.message[type]) {
                    this.message[type] = [];
                }
                this.message[type].push(callback);
            }

            $off(type, callback) {
                if(!this.message[type]) return;
                if(!callback) this.message[type] = undefined;

                this.message[type] = this.message[type].filter((item) => item !== callback);
            }

            $emit(type) {
                if(!this.message[type]) return
                this.message[type].forEach(item => {
                    item();
                });

            }
        }

        let person = new Observer();
        function buy() {
            console.log('buy');
        }
        function walk() {
            console.log('walk');
        }
        person.$on('buy', buy);
        person.$on('walk', walk);

        person.$off('walk', walk);

        person.$emit('buy');
        console.log(person);

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e2f5fee4fa5248acbb20b9e096440a0b~tplv-k3u1fbpfcp-zoom-1.image#?w=649\&h=203\&s=11580\&e=png\&b=ffffff)
