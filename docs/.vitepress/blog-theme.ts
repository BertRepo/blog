/*
 * @Description: 
 * @Author: Bert
 * @Date: 2024-04-24 23:40:26
 * @LastEditors: Bert
 * @LastEditTime: 2024-05-23 16:27:45
 */
// 主题独有配置
import { getThemeConfig } from '@sugarat/theme/node'

// 开启RSS支持（RSS配置）
import type { Theme } from '@sugarat/theme'

// RSS 插件会自动拼接 VitePress 的 base（/blog/），故 baseUrl 取站点根（不含 /blog）
const baseUrl = 'https://bertrepo.github.io'
const RSS: Theme.RSSOptions = {
  title: "Bert 的全栈技术博客",
  baseUrl,
  copyright: 'Copyright (c) 2021-present, Bert',
  description: '分享大前端、后端、计算机基础的原创技术文章与实战经验',
  language: 'zh-cn',
  image: 'https://bertrepo.github.io/blog/title.png',
  favicon: 'https://bertrepo.github.io/blog/logo.jpg',
}

// 所有配置项，详见文档: https://theme.sugarat.top/
const blogTheme = getThemeConfig({
  // 开启RSS支持
  RSS,

  // 搜索
  // 默认开启pagefind离线的全文搜索支持（如使用其它的可以设置为false）
  // 如果npx pagefind 时间过长，可以手动将其安装为项目依赖 pnpm add pagefind
  // search: false,

  // 页脚
  footer: {
    // message 字段支持配置为HTML内容，配置多条可以配置为数组
    // message: '下面 的内容和图标都是可以修改的噢（当然本条内容也是可以隐藏的）',
    copyright: 'MIT License | Bert',
    icpRecord: {
      name: '苏ICP备2021042652号-1',
      link: 'https://beian.miit.gov.cn/'
    },
    securityRecord: {
      name: '苏公网安备32092302000193号',
      link: 'https://www.beian.gov.cn/portal/index.do'
    },
  },

  // 主题色修改
  themeColor: 'el-blue',

  // 文章默认作者
  author: 'Bert',

  // 友链
  friend: [
    {
      nickname: '闲坐含香咀翠',
      des: '博主的掘金主页',
      avatar: 'title.png',
      url: 'https://juejin.cn/user/3844369926334215/posts',
    },
    {
      nickname: 'PrivChat',
      des: '基于 ZKP 与 TEE 的合规大模型隐私网关',
      avatar: 'PrivChat.png',
      url: 'https://privchating.vercel.app/',
    },
    {
      nickname: 'DataVault',
      des: '基于 PIR 的端侧加密 RAG 知识库',
      avatar:
        'DataVault.png',
      url: 'https://privdatavault.vercel.app/',
    },
    {
      nickname: 'AgentShield',
      des: '基于区块链溯源的可信 AI Agent 执行网络',
      avatar:
        'AgentShield.png',
      url: 'https://fed-mind.vercel.app/',
    },
  ],

  // 公告
  popover: {
    title: '公告',
    body: [
      // { type: 'text', content: '👇 微信号 👇' },
      // {
      //   type: 'image',
      //   src: 'https://img2.imgtp.com/2024/04/25/vWnzohsV.jpg'
      // },
      // {
      //   type: 'text',
      //   content: 'xhjdwx_'
      // },
      { type: 'text', content: '微信号👉xhjdwx_' },
      {
        type: 'text',
        content: '欢迎大家私信交流'
      },
      {
        type: 'button',
        content: '关于我',
        props: {
          type: 'primary'
        },
        link: 'http://smarthua.cn/intro.html',
      },
    ],
    duration: -1
  },
})

export { blogTheme }
