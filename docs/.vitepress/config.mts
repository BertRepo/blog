/*
 * @Description: VitePress 站点配置（含 SEO 优化）
 * @Author: Bert
 * @Date: 2024-04-24 23:40:26
 * @LastEditors: Bert
 * @LastEditTime: 2026-07-20 00:00:00
 */
import { defineConfig, type HeadConfig } from 'vitepress'

// 导入主题的配置
import { blogTheme } from './blog-theme'

// 如果使用 GitHub/Gitee Pages 等公共平台部署
// 通常需要修改 base 路径，通常为“/仓库名/”
const base = '/blog/'

// ===== SEO 相关配置 =====
// 站点线上地址（用于 canonical / sitemap / og:url / RSS 等绝对路径）
const siteUrl = 'https://bertrepo.github.io/blog/'
// 站点名称与描述（SEO 友好，含关键词）
const siteTitle = "Bert 的全栈技术博客 | 前端·后端·计算机基础"
const siteDescription =
  '分享大前端、后端、计算机基础的原创技术文章与实战经验，涵盖 JavaScript、Vue、Node.js、工程化、性能优化、面试手写题等。'
// 社交分享默认封面图（建议 1200×630，可替换 public 下同名图片）
const defaultOgImage = siteUrl + 'title.png'

// 相对路径 -> 绝对 URL（首页 index.md 映射为站点根）
function toAbsoluteUrl(relativePath: string): string {
  if (relativePath === 'index.md') return siteUrl
  return siteUrl + relativePath.replace(/\.md$/, '.html')
}

// 绝对 URL -> 相对路径（用于 sitemap 过滤 noindex 页面）
// 注意：VitePress sitemap 的 item.url 为相对路径（如 'blogs/csAll/data.html'、'intro.html'、'' 表示首页），
// 这里统一转成与 pageData.relativePath 一致的 .md 相对路径，用于 noindex 过滤
function urlToRelativePath(url: string): string {
  let path = url
  if (/^https?:\/\//.test(url)) {
    try {
      path = new URL(url).pathname
    } catch {
      path = url
    }
  }
  if (path.startsWith(base)) path = path.slice(base.length)
  else if (path.startsWith('/')) path = path.slice(1)
  if (path === '') return 'index.md'
  return path.replace(/\.html$/, '.md')
}

// 收集需要 noindex 的页面相对路径（来自 frontmatter.noindex），供 sitemap 过滤
const noindexPaths = new Set<string>()

// Vitepress 默认配置
// 详见文档：https://vitepress.dev/reference/site-config
export default defineConfig({
  // 继承博客主题(@sugarat/theme)
  extends: blogTheme,
  base,
  lang: 'zh-cn',
  title: siteTitle,
  description: siteDescription,
  lastUpdated: true,
  // 详见：https://vitepress.dev/zh/reference/site-config#head
  head: [
    // 配置网站的图标（显示在浏览器的 tab 上）
    ['link', { rel: 'icon', href: '/logo.jpg' }],
    // 全局静态 SEO 标签
    ['meta', { property: 'og:site_name', content: siteTitle }],
    ['meta', { property: 'og:locale', content: 'zh_CN' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }]
  ],
  // 站点地图：https://vitepress.dev/reference/site-config#sitemap
  sitemap: {
    hostname: siteUrl,
    // 过滤标记了 noindex 的页面，避免空内容/隐私页被提交给搜索引擎
    transformItems: (items) =>
      items.filter((item) => !noindexPaths.has(urlToRelativePath(item.url)))
  },
  // 收集 noindex 页面相对路径
  transformPageData: (pageData) => {
    if (pageData.frontmatter?.noindex) {
      noindexPaths.add(pageData.relativePath)
    }
  },
  // 注入每页 SEO 标签：canonical / Open Graph / Twitter Card / JSON-LD
  transformHead: (context) => {
    const { pageData } = context
    const fm = pageData.frontmatter || {}
    const url = toAbsoluteUrl(pageData.relativePath)
    const title = (fm.title as string) || pageData.title || siteTitle
    const description =
      (fm.description as string) || pageData.description || siteDescription

    // 文章页：blogs 目录下且非分类入口 index.md
    const isArticle =
      pageData.relativePath.startsWith('blogs/') &&
      !pageData.relativePath.endsWith('index.md')
    const ogType = isArticle ? 'article' : 'website'
    const image = (fm.image as string) || defaultOgImage

    const head: HeadConfig[] = [
      // canonical 规范链接，避免重复内容
      ['link', { rel: 'canonical', href: url }],
      // Open Graph（社交分享预览）
      ['meta', { property: 'og:type', content: ogType }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:image', content: image }],
      // Twitter Card
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: image }]
    ]

    if (fm.noindex) {
      // 阻止搜索引擎收录该页（隐私页 / 空内容页）
      head.push(['meta', { name: 'robots', content: 'noindex, nofollow' }])
    } else {
      // JSON-LD 结构化数据，帮助搜索引擎理解页面内容
      if (isArticle) {
        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: title,
          description,
          image: [image],
          author: { '@type': 'Person', name: (fm.author as string) || 'Bert' },
          url
        }
        if (fm.date) jsonLd.datePublished = String(fm.date)
        if (pageData.lastUpdated)
          jsonLd.dateModified = new Date(pageData.lastUpdated).toISOString()
        head.push([
          'script',
          { type: 'application/ld+json' },
          JSON.stringify(jsonLd)
        ])
      } else if (pageData.relativePath === 'index.md') {
        head.push([
          'script',
          { type: 'application/ld+json' },
          JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: siteTitle,
            description: siteDescription,
            url: siteUrl
          })
        ])
      }
    }

    return head
  },
  themeConfig: {
    // 展示 2,3 级标题在目录中
    outline: {
      level: [2, 3],
      label: '目录'
    },
    // 默认文案修改
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '相关文章',
    lastUpdatedText: '上次更新于',

    // 设置logo
    logo: '/title.png',
    // editLink: {
    //   pattern:
    //     'https://github.com/ATQQ/sugar-blog/tree/master/packages/blogpress/:path',
    //   text: '去 GitHub 上编辑内容'
    // },
    nav: [
      { text: '🏠首页', link: '/' },
      {
        text: "前端博客",
        link: "/blogs/frontend/index",
        // children: [
        //   { text: "前端博客汇总", icon: "edit", link: "front_simple" },
        //   { text: "JavaScript", icon: "edit", link: "js" },
        //   { text: "浏览器渲染原理", icon: "edit", link: "browser/browser" },
        //   { text: "浏览器事件循环", icon: "edit", link: "browser/eventLoop" },
        //   { text: "JS库开发", icon: "edit", link: "module_develop" },
        //   { text: "Vue全家桶", icon: "edit", link: "vue" },
        // ],
      },
      {
        text: "后端笔记",
        link: "/blogs/backend/index",
      },
      {
        text: "计算机综合",
        link: "/blogs/csAll/index",
      },
      {
        text: "🤖AI 专栏",
        link: "/blogs/ai/index",
      },
      { text: '关于我', link: '/intro' }
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/BertRepo'
      }
    ]
  }
})
