/**
 * PocketMail — Expanded Curated Non-Cyberpunk Theme & Background Studio
 * 14 Warm Color Palettes + 16 Scenic Illustrated Wallpapers + Live Glass, Blur,
 * Card Style, and Custom Photo/URL Wallpaper Controls.
 */

(function (global) {
  const THEMES = {
    'warm-linen': {
      id: 'warm-linen',
      name: 'Warm Linen',
      subtitle: 'Creamy paper & terracotta',
      defaultWallpaper: 'watercolor-hills',
      previewGradient: 'linear-gradient(135deg, #FAF5EE 0%, #F2E6D8 55%, #E8C7B4 100%)',
      accentDot: '#D95032',
      vars: {
        '--bg-base': '#FAF3E8',
        '--bg-secondary': '#F2E6D6',
        '--card-rgb': '255, 252, 247',
        '--card-bg': 'rgba(255, 252, 247, 0.76)',
        '--card-bg-hover': 'rgba(255, 254, 251, 0.92)',
        '--card-bg-solid': '#FFFDF9',
        '--header-bg': 'rgba(250, 243, 232, 0.82)',
        '--text-primary': '#2B211B',
        '--text-secondary': '#665447',
        '--text-muted': '#968374',
        '--accent': '#D95032',
        '--accent-hover': '#BF3F22',
        '--accent-soft': 'rgba(217, 80, 50, 0.14)',
        '--accent-contrast': '#FFFDF9',
        '--border-color': 'rgba(130, 100, 78, 0.15)',
        '--border-strong': 'rgba(130, 100, 78, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(66, 43, 27, 0.07)',
        '--shadow-hover': '0 10px 26px rgba(66, 43, 27, 0.13)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#D95032',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(130, 100, 78, 0.25)'
      }
    },
    'sakura-morning': {
      id: 'sakura-morning',
      name: 'Sakura Morning',
      subtitle: 'Soft petal blush & rosewood',
      defaultWallpaper: 'sakura-petals',
      previewGradient: 'linear-gradient(135deg, #FDF6F7 0%, #F9E6EA 55%, #EEBFC9 100%)',
      accentDot: '#C8526C',
      vars: {
        '--bg-base': '#FCEEF1',
        '--bg-secondary': '#F7E0E5',
        '--card-rgb': '255, 251, 252',
        '--card-bg': 'rgba(255, 251, 252, 0.75)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.92)',
        '--card-bg-solid': '#FFFCFD',
        '--header-bg': 'rgba(252, 238, 241, 0.82)',
        '--text-primary': '#331F24',
        '--text-secondary': '#6E4E56',
        '--text-muted': '#9E7B84',
        '--accent': '#C8526C',
        '--accent-hover': '#AE3E57',
        '--accent-soft': 'rgba(200, 82, 108, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(170, 100, 115, 0.16)',
        '--border-strong': 'rgba(170, 100, 115, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(74, 35, 45, 0.07)',
        '--shadow-hover': '0 10px 26px rgba(74, 35, 45, 0.13)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#C8526C',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(170, 100, 115, 0.24)'
      }
    },
    'soft-sage': {
      id: 'soft-sage',
      name: 'Botanical Sage',
      subtitle: 'Eucalyptus & misty fern',
      defaultWallpaper: 'botanical-leaves',
      previewGradient: 'linear-gradient(135deg, #F2F7F3 0%, #E1EDE4 55%, #B8D4C2 100%)',
      accentDot: '#2E6F53',
      vars: {
        '--bg-base': '#EAF3EC',
        '--bg-secondary': '#DCEADF',
        '--card-rgb': '252, 255, 253',
        '--card-bg': 'rgba(252, 255, 253, 0.75)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.92)',
        '--card-bg-solid': '#FCFFFD',
        '--header-bg': 'rgba(234, 243, 236, 0.82)',
        '--text-primary': '#1B2E24',
        '--text-secondary': '#466052',
        '--text-muted': '#748F80',
        '--accent': '#2E6F53',
        '--accent-hover': '#225740',
        '--accent-soft': 'rgba(46, 111, 83, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(46, 111, 83, 0.15)',
        '--border-strong': 'rgba(46, 111, 83, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(27, 46, 36, 0.06)',
        '--shadow-hover': '0 10px 26px rgba(27, 46, 36, 0.12)',
        '--success': '#2E7D5B',
        '--warning': '#D17D28',
        '--danger': '#C43E3E',
        '--badge-bg': '#2E6F53',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(46, 111, 83, 0.24)'
      }
    },
    'coastal-breeze': {
      id: 'coastal-breeze',
      name: 'Coastal Breeze',
      subtitle: 'Aegean sea glass & warm sand',
      defaultWallpaper: 'ocean-waves',
      previewGradient: 'linear-gradient(135deg, #F2F7FA 0%, #E1EEF6 55%, #B5D4E9 100%)',
      accentDot: '#2B6CB0',
      vars: {
        '--bg-base': '#EAF3F8',
        '--bg-secondary': '#DCEAF3',
        '--card-rgb': '252, 254, 255',
        '--card-bg': 'rgba(252, 254, 255, 0.75)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.92)',
        '--card-bg-solid': '#FCFEFF',
        '--header-bg': 'rgba(234, 243, 248, 0.82)',
        '--text-primary': '#1A2B3C',
        '--text-secondary': '#4A6278',
        '--text-muted': '#7891A8',
        '--accent': '#2B6CB0',
        '--accent-hover': '#1E548E',
        '--accent-soft': 'rgba(43, 108, 176, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(43, 108, 176, 0.15)',
        '--border-strong': 'rgba(43, 108, 176, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(26, 43, 60, 0.06)',
        '--shadow-hover': '0 10px 26px rgba(26, 43, 60, 0.12)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#2B6CB0',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(43, 108, 176, 0.24)'
      }
    },
    'golden-hour': {
      id: 'golden-hour',
      name: 'Golden Hour',
      subtitle: 'Tuscan honey & warm apricot',
      defaultWallpaper: 'cloud-kingdom',
      previewGradient: 'linear-gradient(135deg, #FDF7EE 0%, #F8E8CE 55%, #EDC48F 100%)',
      accentDot: '#C86D22',
      vars: {
        '--bg-base': '#FBF0DF',
        '--bg-secondary': '#F5E3C8',
        '--card-rgb': '255, 252, 246',
        '--card-bg': 'rgba(255, 252, 246, 0.76)',
        '--card-bg-hover': 'rgba(255, 255, 252, 0.93)',
        '--card-bg-solid': '#FFFDF8',
        '--header-bg': 'rgba(251, 240, 223, 0.82)',
        '--text-primary': '#2E2114',
        '--text-secondary': '#6E553B',
        '--text-muted': '#9A8063',
        '--accent': '#C86D22',
        '--accent-hover': '#A95714',
        '--accent-soft': 'rgba(200, 109, 34, 0.15)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(160, 110, 60, 0.16)',
        '--border-strong': 'rgba(160, 110, 60, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(74, 48, 20, 0.07)',
        '--shadow-hover': '0 10px 26px rgba(74, 48, 20, 0.13)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#C86D22',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(160, 110, 60, 0.25)'
      }
    },
    'lavender-cloud': {
      id: 'lavender-cloud',
      name: 'Lavender Cloud',
      subtitle: 'Wisteria mist & soft alabaster',
      defaultWallpaper: 'lavender-fields',
      previewGradient: 'linear-gradient(135deg, #F7F5FC 0%, #EBE6F7 55%, #CFC3EC 100%)',
      accentDot: '#6B4E9B',
      vars: {
        '--bg-base': '#F2EFFA',
        '--bg-secondary': '#E6E0F5',
        '--card-rgb': '253, 252, 255',
        '--card-bg': 'rgba(253, 252, 255, 0.75)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.92)',
        '--card-bg-solid': '#FDFCFF',
        '--header-bg': 'rgba(242, 239, 250, 0.82)',
        '--text-primary': '#241D30',
        '--text-secondary': '#594D6E',
        '--text-muted': '#87799E',
        '--accent': '#6B4E9B',
        '--accent-hover': '#563B82',
        '--accent-soft': 'rgba(107, 78, 155, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(107, 78, 155, 0.15)',
        '--border-strong': 'rgba(107, 78, 155, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(36, 29, 48, 0.06)',
        '--shadow-hover': '0 10px 26px rgba(36, 29, 48, 0.12)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#6B4E9B',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(107, 78, 155, 0.24)'
      }
    },
    'matcha-latte': {
      id: 'matcha-latte',
      name: 'Matcha & Oat',
      subtitle: 'Ceremonial green tea & cream',
      defaultWallpaper: 'japanese-garden',
      previewGradient: 'linear-gradient(135deg, #F4F7EE 0%, #E4ECD4 55%, #BCD09C 100%)',
      accentDot: '#4F772D',
      vars: {
        '--bg-base': '#F1F5E9',
        '--bg-secondary': '#E4ECD6',
        '--card-rgb': '253, 255, 250',
        '--card-bg': 'rgba(253, 255, 250, 0.76)',
        '--card-bg-hover': 'rgba(255, 255, 253, 0.93)',
        '--card-bg-solid': '#FDFFFA',
        '--header-bg': 'rgba(241, 245, 233, 0.82)',
        '--text-primary': '#222E18',
        '--text-secondary': '#516340',
        '--text-muted': '#7E916B',
        '--accent': '#4F772D',
        '--accent-hover': '#3B5D1F',
        '--accent-soft': 'rgba(79, 119, 45, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(79, 119, 45, 0.15)',
        '--border-strong': 'rgba(79, 119, 45, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(34, 46, 24, 0.06)',
        '--shadow-hover': '0 10px 26px rgba(34, 46, 24, 0.12)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#4F772D',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(79, 119, 45, 0.24)'
      }
    },
    'peach-sorbet': {
      id: 'peach-sorbet',
      name: 'Peach Sorbet',
      subtitle: 'Sun-ripened peach & coral',
      defaultWallpaper: 'desert-dunes',
      previewGradient: 'linear-gradient(135deg, #FFF5F0 0%, #FDE2D4 55%, #F7B599 100%)',
      accentDot: '#E05A47',
      vars: {
        '--bg-base': '#FDF0E8',
        '--bg-secondary': '#F9E0D2',
        '--card-rgb': '255, 252, 250',
        '--card-bg': 'rgba(255, 252, 250, 0.76)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.93)',
        '--card-bg-solid': '#FFFCFA',
        '--header-bg': 'rgba(253, 240, 232, 0.82)',
        '--text-primary': '#331E19',
        '--text-secondary': '#734B42',
        '--text-muted': '#A37A70',
        '--accent': '#E05A47',
        '--accent-hover': '#C44331',
        '--accent-soft': 'rgba(224, 90, 71, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(180, 90, 70, 0.15)',
        '--border-strong': 'rgba(180, 90, 70, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(74, 35, 25, 0.06)',
        '--shadow-hover': '0 10px 26px rgba(74, 35, 25, 0.12)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#E05A47',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(180, 90, 70, 0.24)'
      }
    },
    'autumn-maple': {
      id: 'autumn-maple',
      name: 'Kyoto Maple',
      subtitle: 'Cinnamon leaf & warm parchment',
      defaultWallpaper: 'autumn-forest',
      previewGradient: 'linear-gradient(135deg, #FBF2EC 0%, #F4DEC9 55%, #DFA17B 100%)',
      accentDot: '#B5382A',
      vars: {
        '--bg-base': '#F9EFE6',
        '--bg-secondary': '#F0DFCF',
        '--card-rgb': '255, 252, 248',
        '--card-bg': 'rgba(255, 252, 248, 0.76)',
        '--card-bg-hover': 'rgba(255, 255, 252, 0.93)',
        '--card-bg-solid': '#FFFDF9',
        '--header-bg': 'rgba(249, 239, 230, 0.82)',
        '--text-primary': '#2D1B16',
        '--text-secondary': '#69473E',
        '--text-muted': '#99756B',
        '--accent': '#B5382A',
        '--accent-hover': '#96291D',
        '--accent-soft': 'rgba(181, 56, 42, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(150, 75, 55, 0.15)',
        '--border-strong': 'rgba(150, 75, 55, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(60, 25, 18, 0.07)',
        '--shadow-hover': '0 10px 26px rgba(60, 25, 18, 0.13)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#B5382A',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(150, 75, 55, 0.24)'
      }
    },
    'nordic-fjord': {
      id: 'nordic-fjord',
      name: 'Nordic Fjord',
      subtitle: 'Scandinavian slate & birch',
      defaultWallpaper: 'mountain-mist',
      previewGradient: 'linear-gradient(135deg, #F2F5F7 0%, #E0E8EE 55%, #B3C5D4 100%)',
      accentDot: '#3D5A80',
      vars: {
        '--bg-base': '#EEF2F6',
        '--bg-secondary': '#E0E7EE',
        '--card-rgb': '252, 254, 255',
        '--card-bg': 'rgba(252, 254, 255, 0.76)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.93)',
        '--card-bg-solid': '#FCFEFF',
        '--header-bg': 'rgba(238, 242, 246, 0.82)',
        '--text-primary': '#1D2939',
        '--text-secondary': '#4B5E75',
        '--text-muted': '#7D8FA6',
        '--accent': '#3D5A80',
        '--accent-hover': '#2C4463',
        '--accent-soft': 'rgba(61, 90, 128, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(61, 90, 128, 0.15)',
        '--border-strong': 'rgba(61, 90, 128, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(29, 41, 57, 0.06)',
        '--shadow-hover': '0 10px 26px rgba(29, 41, 57, 0.12)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#3D5A80',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(61, 90, 128, 0.24)'
      }
    },
    'rose-quartz': {
      id: 'rose-quartz',
      name: 'Rose Champagne',
      subtitle: 'Velvet blush & warm silk',
      defaultWallpaper: 'paper-origami',
      previewGradient: 'linear-gradient(135deg, #FAF3F3 0%, #F2E2E2 55%, #DFBEBE 100%)',
      accentDot: '#A85766',
      vars: {
        '--bg-base': '#F9F0F0',
        '--bg-secondary': '#F0E1E1',
        '--card-rgb': '255, 252, 252',
        '--card-bg': 'rgba(255, 252, 252, 0.76)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.93)',
        '--card-bg-solid': '#FFFCFC',
        '--header-bg': 'rgba(249, 240, 240, 0.82)',
        '--text-primary': '#2E2023',
        '--text-secondary': '#694F54',
        '--text-muted': '#997E84',
        '--accent': '#A85766',
        '--accent-hover': '#8C4351',
        '--accent-soft': 'rgba(168, 87, 102, 0.14)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(168, 87, 102, 0.15)',
        '--border-strong': 'rgba(168, 87, 102, 0.28)',
        '--shadow-soft': '0 6px 20px rgba(55, 30, 35, 0.06)',
        '--shadow-hover': '0 10px 26px rgba(55, 30, 35, 0.12)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#A85766',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(168, 87, 102, 0.24)'
      }
    },
    'pure-paper': {
      id: 'pure-paper',
      name: 'Gallery Paper',
      subtitle: 'Crisp minimalist stationery',
      defaultWallpaper: 'warm-terrazzo',
      previewGradient: 'linear-gradient(135deg, #FFFFFF 0%, #F4F5F7 55%, #E4E7EC 100%)',
      accentDot: '#D95032',
      vars: {
        '--bg-base': '#F5F4F0',
        '--bg-secondary': '#EAE8E1',
        '--card-rgb': '255, 255, 255',
        '--card-bg': 'rgba(255, 255, 255, 0.82)',
        '--card-bg-hover': 'rgba(255, 255, 255, 0.96)',
        '--card-bg-solid': '#FFFFFF',
        '--header-bg': 'rgba(245, 244, 240, 0.85)',
        '--text-primary': '#1F1F1D',
        '--text-secondary': '#575652',
        '--text-muted': '#8C8A84',
        '--accent': '#D95032',
        '--accent-hover': '#BC3D21',
        '--accent-soft': 'rgba(217, 80, 50, 0.12)',
        '--accent-contrast': '#FFFFFF',
        '--border-color': 'rgba(31, 31, 29, 0.1)',
        '--border-strong': 'rgba(31, 31, 29, 0.2)',
        '--shadow-soft': '0 4px 14px rgba(0, 0, 0, 0.05)',
        '--shadow-hover': '0 8px 22px rgba(0, 0, 0, 0.09)',
        '--success': '#2E7D5B',
        '--warning': '#D9822B',
        '--danger': '#C93B2B',
        '--badge-bg': '#D95032',
        '--badge-text': '#FFFFFF',
        '--scrollbar-thumb': 'rgba(31, 31, 29, 0.2)'
      }
    },
    'cozy-espresso': {
      id: 'cozy-espresso',
      name: 'Cozy Espresso',
      subtitle: 'Warm roasted coffeehouse dark',
      defaultWallpaper: 'cafe-rain',
      previewGradient: 'linear-gradient(135deg, #231C18 0%, #332822 55%, #4F3C31 100%)',
      accentDot: '#E57A54',
      vars: {
        '--bg-base': '#1E1815',
        '--bg-secondary': '#29211D',
        '--card-rgb': '44, 35, 30',
        '--card-bg': 'rgba(44, 35, 30, 0.78)',
        '--card-bg-hover': 'rgba(56, 45, 39, 0.92)',
        '--card-bg-solid': '#2E2520',
        '--header-bg': 'rgba(30, 24, 21, 0.84)',
        '--text-primary': '#F5ECE4',
        '--text-secondary': '#C7B6A8',
        '--text-muted': '#8F7E70',
        '--accent': '#E57A54',
        '--accent-hover': '#F08C68',
        '--accent-soft': 'rgba(229, 122, 84, 0.18)',
        '--accent-contrast': '#1E1815',
        '--border-color': 'rgba(245, 236, 228, 0.11)',
        '--border-strong': 'rgba(245, 236, 228, 0.22)',
        '--shadow-soft': '0 6px 20px rgba(10, 7, 5, 0.35)',
        '--shadow-hover': '0 10px 28px rgba(10, 7, 5, 0.5)',
        '--success': '#52B788',
        '--warning': '#F4A261',
        '--danger': '#E76F51',
        '--badge-bg': '#E57A54',
        '--badge-text': '#1E1815',
        '--scrollbar-thumb': 'rgba(245, 236, 228, 0.22)'
      }
    },
    'midnight-velvet': {
      id: 'midnight-velvet',
      name: 'Starlit Study',
      subtitle: 'Candlelit velvet & warm gold',
      defaultWallpaper: 'starry-dusk',
      previewGradient: 'linear-gradient(135deg, #1E1B24 0%, #2D2638 55%, #4A3E59 100%)',
      accentDot: '#E9B872',
      vars: {
        '--bg-base': '#1C1924',
        '--bg-secondary': '#272233',
        '--card-rgb': '42, 36, 54',
        '--card-bg': 'rgba(42, 36, 54, 0.78)',
        '--card-bg-hover': 'rgba(54, 46, 68, 0.92)',
        '--card-bg-solid': '#2B2538',
        '--header-bg': 'rgba(28, 25, 36, 0.84)',
        '--text-primary': '#F4EFEA',
        '--text-secondary': '#C4B9D0',
        '--text-muted': '#8E829E',
        '--accent': '#E9B872',
        '--accent-hover': '#F2C88B',
        '--accent-soft': 'rgba(233, 184, 114, 0.18)',
        '--accent-contrast': '#1C1924',
        '--border-color': 'rgba(244, 239, 234, 0.11)',
        '--border-strong': 'rgba(244, 239, 234, 0.22)',
        '--shadow-soft': '0 6px 20px rgba(8, 6, 14, 0.38)',
        '--shadow-hover': '0 10px 28px rgba(8, 6, 14, 0.52)',
        '--success': '#52B788',
        '--warning': '#F4A261',
        '--danger': '#E76F51',
        '--badge-bg': '#E9B872',
        '--badge-text': '#1C1924',
        '--scrollbar-thumb': 'rgba(244, 239, 234, 0.22)'
      }
    }
  };

  /**
   * 16 Rich Illustrated Scenic SVG Backgrounds (100% local, clearly visible & organic)
   */
  const WALLPAPERS = {
    'watercolor-hills': {
      id: 'watercolor-hills',
      name: 'Tuscan Rolling Hills',
      description: 'Warm sunlit hills & afternoon sky',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FAD6A5" stop-opacity="0.55"/>
            <stop offset="60%" stop-color="#F5C396" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#E8A57E" stop-opacity="0.2"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#sky)"/>
        <circle cx="640" cy="115" r="72" fill="#F49752" fill-opacity="0.38"/>
        <circle cx="640" cy="115" r="115" fill="#F49752" fill-opacity="0.18"/>
        <path d="M0 320 Q180 240 410 310 T800 280 L800 600 L0 600 Z" fill="#E59866" fill-opacity="0.28"/>
        <path d="M0 400 Q260 320 520 395 T800 360 L800 600 L0 600 Z" fill="#C97349" fill-opacity="0.28"/>
        <path d="M0 480 Q190 420 460 475 T800 450 L800 600 L0 600 Z" fill="#8E4B2E" fill-opacity="0.24"/>
      </svg>`
    },
    'sakura-petals': {
      id: 'sakura-petals',
      name: 'Sakura Blossom Branch',
      description: 'Flowering cherry branches & drifting petals',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="blush" cx="80%" cy="18%" r="75%">
            <stop offset="0%" stop-color="#F7B2C4" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#FADCE4" stop-opacity="0.1"/>
          </radialGradient>
        </defs>
        <rect width="800" height="600" fill="url(#blush)"/>
        <circle cx="660" cy="105" r="105" fill="#F294AC" fill-opacity="0.28"/>
        <circle cx="130" cy="480" r="145" fill="#F5B0C2" fill-opacity="0.28"/>
        <!-- Flowering branch top right -->
        <path d="M800 35 Q670 85 570 55 M690 68 Q640 135 585 160" stroke="#7A4955" stroke-opacity="0.28" stroke-width="4" fill="none" stroke-linecap="round"/>
        <g fill="#E56B88" fill-opacity="0.34">
          <circle cx="570" cy="55" r="16"/><circle cx="585" cy="43" r="12"/><circle cx="558" cy="42" r="12"/>
          <circle cx="650" cy="70" r="18"/><circle cx="666" cy="58" r="13"/><circle cx="638" cy="56" r="13"/>
          <circle cx="585" cy="160" r="15"/><circle cx="600" cy="150" r="11"/>
          <circle cx="735" cy="50" r="19"/>
        </g>
        <!-- Drifting petals -->
        <g fill="#DE5D7B" fill-opacity="0.3">
          <path d="M480 120 C498 102 522 114 510 138 C498 156 474 144 480 120 Z"/>
          <path d="M360 210 C375 195 395 205 385 225 C375 240 355 230 360 210 Z"/>
          <path d="M160 150 C175 135 195 145 185 165 C175 180 155 170 160 150 Z"/>
          <path d="M670 310 C688 292 712 304 700 328 C688 346 664 334 670 310 Z"/>
          <path d="M220 390 C235 375 255 385 245 405 C235 420 215 410 220 390 Z"/>
          <path d="M530 470 C548 452 572 464 560 488 C548 506 524 494 530 470 Z"/>
        </g>
      </svg>`
    },
    'botanical-leaves': {
      id: 'botanical-leaves',
      name: 'Pressed Botanicals',
      description: 'Lush eucalyptus & olive foliage',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <circle cx="140" cy="110" r="140" fill="#68A385" fill-opacity="0.22"/>
        <circle cx="680" cy="480" r="165" fill="#528C6E" fill-opacity="0.22"/>
        <g fill="#2F6E4E" fill-opacity="0.24" stroke="#2F6E4E" stroke-opacity="0.3" stroke-width="2">
          <path d="M720 -10 Q640 160 510 290" fill="none" stroke-width="3"/>
          <ellipse cx="670" cy="55" rx="42" ry="20" transform="rotate(-25 670 55)"/>
          <ellipse cx="620" cy="120" rx="46" ry="22" transform="rotate(22 620 120)"/>
          <ellipse cx="575" cy="185" rx="40" ry="19" transform="rotate(-28 575 185)"/>
          <ellipse cx="530" cy="245" rx="34" ry="17" transform="rotate(18 530 245)"/>
          <path d="M60 610 Q140 440 270 320" fill="none" stroke-width="3"/>
          <ellipse cx="110" cy="520" rx="42" ry="20" transform="rotate(-25 110 520)"/>
          <ellipse cx="165" cy="455" rx="44" ry="21" transform="rotate(25 165 455)"/>
          <ellipse cx="220" cy="390" rx="38" ry="18" transform="rotate(-20 220 390)"/>
        </g>
      </svg>`
    },
    'japanese-garden': {
      id: 'japanese-garden',
      name: 'Kyoto Lake & Reflections',
      description: 'Serene mountain lake, red sun & misty pines',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <circle cx="610" cy="135" r="78" fill="#E05A47" fill-opacity="0.34"/>
        <path d="M0 330 L170 210 L340 310 L540 180 L730 290 L800 240 L800 600 L0 600 Z" fill="#6C8C74" fill-opacity="0.22"/>
        <path d="M0 410 Q240 350 480 410 T800 385 L800 600 L0 600 Z" fill="#466B53" fill-opacity="0.26"/>
        <rect x="0" y="465" width="800" height="135" fill="#7FA693" fill-opacity="0.22"/>
        <ellipse cx="610" cy="510" rx="65" ry="7" fill="#E05A47" fill-opacity="0.25"/>
        <ellipse cx="610" cy="532" rx="45" ry="5" fill="#E05A47" fill-opacity="0.2"/>
      </svg>`
    },
    'cloud-kingdom': {
      id: 'cloud-kingdom',
      name: 'Sunlit Cumulus Clouds',
      description: 'Dreamy golden-hour painted sky & soft clouds',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="csky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#F7C58E" stop-opacity="0.45"/>
            <stop offset="50%" stop-color="#F9DEC1" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#E8B4BC" stop-opacity="0.35"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#csky)"/>
        <g fill="#FFFFFF" fill-opacity="0.55">
          <circle cx="140" cy="390" r="75"/><circle cx="215" cy="375" r="95"/><circle cx="305" cy="400" r="70"/>
          <circle cx="560" cy="440" r="85"/><circle cx="650" cy="415" r="105"/><circle cx="745" cy="445" r="80"/>
          <circle cx="640" cy="140" r="55"/><circle cx="700" cy="135" r="68"/><circle cx="755" cy="150" r="48"/>
        </g>
      </svg>`
    },
    'starry-dusk': {
      id: 'starry-dusk',
      name: 'Starlit Twilight & Fireflies',
      description: 'Crescent moon, warm fireflies & twilight hills',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5A4878" stop-opacity="0.38"/>
            <stop offset="65%" stop-color="#8C658C" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#D99B66" stop-opacity="0.28"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#dusk)"/>
        <!-- Crescent Moon -->
        <path d="M650 75 A42 42 0 1 0 695 135 A34 34 0 1 1 650 75 Z" fill="#F6C87A" fill-opacity="0.65"/>
        <!-- Glowing Fireflies / Stars -->
        <g fill="#F6C87A" fill-opacity="0.65">
          <circle cx="140" cy="95" r="3.5"/><circle cx="280" cy="65" r="2.5"/><circle cx="460" cy="110" r="3"/>
          <circle cx="190" cy="240" r="4"/><circle cx="530" cy="280" r="4.5"/><circle cx="680" cy="260" r="3.5"/>
          <circle cx="340" cy="360" r="5"/><circle cx="120" cy="420" r="4"/><circle cx="610" cy="430" r="4.5"/>
        </g>
        <path d="M0 430 Q220 360 470 420 T800 390 L800 600 L0 600 Z" fill="#46345E" fill-opacity="0.3"/>
        <path d="M0 500 Q300 450 560 505 T800 480 L800 600 L0 600 Z" fill="#2E2040" fill-opacity="0.35"/>
      </svg>`
    },
    'ocean-waves': {
      id: 'ocean-waves',
      name: 'Calm Coastal Tide',
      description: 'Gentle sea glass waves & coastal sun',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <circle cx="650" cy="110" r="82" fill="#6BB0DB" fill-opacity="0.32"/>
        <path d="M0 340 C180 290 320 380 500 335 C640 300 730 350 800 330 L800 600 L0 600 Z" fill="#5299C7" fill-opacity="0.24"/>
        <path d="M0 420 C210 380 370 460 560 415 C680 390 750 430 800 410 L800 600 L0 600 Z" fill="#3278A6" fill-opacity="0.26"/>
        <path d="M0 500 C160 470 340 535 540 495 C670 470 740 510 800 495 L800 600 L0 600 Z" fill="#1F5A82" fill-opacity="0.28"/>
      </svg>`
    },
    'mountain-mist': {
      id: 'mountain-mist',
      name: 'Morning Mountain Mist',
      description: 'Layered serene ridges in early sunrise',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <circle cx="210" cy="125" r="74" fill="#F2B866" fill-opacity="0.38"/>
        <path d="M0 340 L150 220 L310 315 L490 185 L660 305 L800 225 L800 600 L0 600 Z" fill="#7D6B9E" fill-opacity="0.22"/>
        <path d="M0 420 L195 310 L370 395 L570 280 L720 380 L800 335 L800 600 L0 600 Z" fill="#5E4C80" fill-opacity="0.25"/>
        <path d="M0 495 L245 415 L455 480 L665 405 L800 460 L800 600 L0 600 Z" fill="#433461" fill-opacity="0.28"/>
      </svg>`
    },
    'desert-dunes': {
      id: 'desert-dunes',
      name: 'Warm Terracotta Dunes',
      description: 'Sweeping sunlit sand dunes & warm horizon',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <circle cx="180" cy="115" r="85" fill="#F2845C" fill-opacity="0.35"/>
        <path d="M0 330 Q240 230 520 340 T800 300 L800 600 L0 600 Z" fill="#E89973" fill-opacity="0.3"/>
        <path d="M0 420 Q180 390 420 320 Q640 260 800 370 L800 600 L0 600 Z" fill="#D4744E" fill-opacity="0.28"/>
        <path d="M0 490 Q290 410 590 490 T800 465 L800 600 L0 600 Z" fill="#A84E2E" fill-opacity="0.26"/>
      </svg>`
    },
    'lavender-fields': {
      id: 'lavender-fields',
      name: 'Provence Lavender Rows',
      description: 'Rolling wisteria & violet fields at sunset',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <circle cx="640" cy="115" r="80" fill="#F2AE72" fill-opacity="0.35"/>
        <path d="M0 360 Q220 290 480 355 T800 330 L800 600 L0 600 Z" fill="#9B7EDE" fill-opacity="0.24"/>
        <path d="M0 425 Q280 365 550 425 T800 400 L800 600 L0 600 Z" fill="#7A5DC7" fill-opacity="0.26"/>
        <path d="M0 495 Q200 445 480 495 T800 475 L800 600 L0 600 Z" fill="#593EA3" fill-opacity="0.28"/>
      </svg>`
    },
    'autumn-forest': {
      id: 'autumn-forest',
      name: 'Autumn Woodland Canopy',
      description: 'Warm amber, maple & cinnamon forest silhouettes',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <circle cx="650" cy="120" r="95" fill="#E8834A" fill-opacity="0.32"/>
        <circle cx="110" cy="80" r="140" fill="#D95D39" fill-opacity="0.24"/>
        <circle cx="720" cy="50" r="130" fill="#E07A47" fill-opacity="0.26"/>
        <path d="M0 380 L80 280 L155 380 L240 250 L330 380 L430 270 L520 380 L630 245 L725 380 L800 295 L800 600 L0 600 Z" fill="#C45A36" fill-opacity="0.22"/>
        <path d="M0 470 Q260 410 530 465 T800 440 L800 600 L0 600 Z" fill="#8C371E" fill-opacity="0.25"/>
      </svg>`
    },
    'paper-origami': {
      id: 'paper-origami',
      name: 'Layered Washi Paper',
      description: 'Tactile overlapping Japanese paper curves',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <path d="M0 160 C260 220 440 60 800 140 L800 600 L0 600 Z" fill="#D98A7C" fill-opacity="0.18"/>
        <path d="M0 290 C220 200 520 350 800 250 L800 600 L0 600 Z" fill="#C46D5E" fill-opacity="0.2"/>
        <path d="M0 420 C300 480 510 340 800 410 L800 600 L0 600 Z" fill="#9E4F42" fill-opacity="0.22"/>
      </svg>`
    },
    'cafe-rain': {
      id: 'cafe-rain',
      name: 'Cozy Cafe Bokeh Lights',
      description: 'Soft golden bokeh circles & warm raindrop glow',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <g fill="#F4A261" fill-opacity="0.26">
          <circle cx="130" cy="140" r="65"/><circle cx="240" cy="95" r="42"/><circle cx="640" cy="130" r="78"/>
          <circle cx="550" cy="210" r="50"/><circle cx="170" cy="390" r="85"/><circle cx="670" cy="420" r="90"/>
        </g>
        <g fill="#E9C46A" fill-opacity="0.28">
          <circle cx="320" cy="180" r="35"/><circle cx="480" cy="110" r="45"/><circle cx="710" cy="260" r="38"/>
          <circle cx="290" cy="460" r="55"/><circle cx="520" cy="480" r="62"/>
        </g>
      </svg>`
    },
    'warm-terrazzo': {
      id: 'warm-terrazzo',
      name: 'Venetian Terrazzo',
      description: 'Artisanal stone & terracotta speckles',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
        <g fill-opacity="0.26">
          <polygon points="45,30 68,24 74,48 50,55" fill="#D95032"/>
          <polygon points="180,55 205,45 215,65 190,72" fill="#8D99AE"/>
          <polygon points="320,35 348,42 338,66 312,56" fill="#E09F3E"/>
          <polygon points="95,140 122,132 128,158 100,162" fill="#588157"/>
          <polygon points="260,165 285,155 295,180 268,186" fill="#D95032"/>
          <polygon points="40,275 68,265 72,292 46,296" fill="#E09F3E"/>
          <polygon points="195,285 222,278 228,302 198,308" fill="#BC6C25"/>
          <polygon points="335,295 362,285 370,310 342,316" fill="#588157"/>
          <polygon points="130,355 155,348 162,372 135,375" fill="#8D99AE"/>
        </g>
      </svg>`
    },
    'cozy-window': {
      id: 'cozy-window',
      name: 'Sunlit Study Window',
      description: 'Warm diagonal afternoon sunbeams',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#F4A261" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#F6BD60" stop-opacity="0.04"/>
          </linearGradient>
        </defs>
        <polygon points="0,0 360,0 740,600 300,600" fill="url(#beam)"/>
        <polygon points="410,0 670,0 800,320 800,600 740,600" fill="url(#beam)"/>
      </svg>`
    },
    'none': {
      id: 'none',
      name: 'Pure Solid Surface',
      description: 'Clean minimal surface without background art',
      cssBackground: 'none'
    }
  };

  function svgToDataUrl(svgString) {
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svgString.trim())}")`;
  }

  /**
   * Applies theme variables, card glassmorphism, tab styles, typography, ambient effects,
   * and wallpaper settings to document root
   */
  function applyThemeAndWallpaper(doc, settings = {}) {
    const themeId = settings.theme && THEMES[settings.theme] ? settings.theme : 'warm-linen';
    const theme = THEMES[themeId];
    const root = doc.documentElement;

    // 1. Apply base theme CSS variables
    Object.entries(theme.vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });

    // 2. Dynamic card glass translucency & blur
    const cardStyle = settings.cardStyle || 'glassmorphism';
    let defaultOpacity = 0.72;
    if (cardStyle === 'glassmorphism') defaultOpacity = 0.58;
    if (cardStyle === 'tinted-glass') defaultOpacity = 0.62;
    if (cardStyle === 'outlined-editorial') defaultOpacity = 0.35;
    if (cardStyle === 'warm-paper') defaultOpacity = 0.92;

    const cardOpacity = typeof settings.cardOpacity === 'number' ? settings.cardOpacity : defaultOpacity;
    const cardRgb = theme.vars['--card-rgb'] || '255, 252, 247';
    root.style.setProperty('--card-bg', `rgba(${cardRgb}, ${cardOpacity})`);
    root.style.setProperty('--card-bg-hover', `rgba(${cardRgb}, ${Math.min(0.98, cardOpacity + 0.16)})`);

    const cardBlur = typeof settings.cardBlur === 'number' ? settings.cardBlur : 16;
    root.style.setProperty('--card-blur', `${cardBlur}px`);

    // 3. Card border radius & density + Popup dimensions
    const cardRadius = typeof settings.cardRadius === 'number' ? settings.cardRadius : 15;
    root.style.setProperty('--card-radius', `${cardRadius}px`);

    const popupW = typeof settings.popupWidth === 'number' ? Math.max(380, Math.min(795, settings.popupWidth)) : 520;
    const popupH = typeof settings.popupHeight === 'number' ? Math.max(460, Math.min(600, settings.popupHeight)) : 600;

    let isSidebar = false;
    let isPopout = false;
    if (doc.defaultView && doc.defaultView.location) {
      const win = doc.defaultView;
      const searchStr = win.location.search || '';
      isPopout = searchStr.includes('popout=1');
      // Detect Sidebar mode both by ?sidebar=1 and by viewport height (> 605px, Firefox popup max is 600px)
      isSidebar = searchStr.includes('sidebar=1') || (!isPopout && win.innerHeight > 605);

      if (isSidebar || isPopout) {
        root.setAttribute('data-popout', 'true');
        root.style.setProperty('--popup-width', '100%');
        root.style.setProperty('--popup-height', '100vh');
      } else {
        root.style.setProperty('--popup-width', `${popupW}px`);
        root.style.setProperty('--popup-height', `${popupH}px`);
      }

      if (isSidebar) {
        root.setAttribute('data-sidebar', 'true');
        root.setAttribute('data-view-mode', 'sidebar');
      } else {
        root.setAttribute('data-view-mode', 'popup');
      }
    } else {
      root.style.setProperty('--popup-width', `${popupW}px`);
      root.style.setProperty('--popup-height', `${popupH}px`);
    }

    // 4. Font family preset
    const fontMap = {
      'editorial': '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
      'modern-sans': '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'literary-serif': '"Georgia", "Charter", "Cambria", serif',
      'rounded-cozy': '"Trebuchet MS", "Nunito", "Segoe UI_Rounded", -apple-system, sans-serif'
    };
    const fontStyle = settings.fontStyle || 'editorial';
    root.style.setProperty('--font-sans', fontMap[fontStyle] || fontMap['editorial']);

    // 5. Wallpaper / Custom Gradient / Custom Image (applies to main layer + any live preview stage layers)
    const wallpaperId = settings.wallpaper || theme.defaultWallpaper || 'watercolor-hills';
    const customWallpaperData = settings.customWallpaperData || settings.customWallpaperUrl || '';
    const bgBlur = typeof settings.wallpaperBlur === 'number' ? settings.wallpaperBlur : 0;

    const bgLayers = [
      doc.getElementById('pm-wallpaper-layer'),
      doc.getElementById('pm-preview-wallpaper'),
      doc.getElementById('opt-preview-wallpaper')
    ].filter(Boolean);

    bgLayers.forEach((bgLayer) => {
      bgLayer.style.filter = bgBlur > 0 ? `blur(${bgBlur}px) scale(1.04)` : 'none';

      if (wallpaperId === 'custom-gradient') {
        const c1 = settings.customGradient1 || settings.gradientColor1 || '#FAD6A5';
        const c2 = settings.customGradient2 || settings.gradientColor2 || '#E8A598';
        const angle = settings.gradientAngle !== undefined ? settings.gradientAngle : 135;
        bgLayer.style.backgroundImage = `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
        bgLayer.style.backgroundSize = 'cover';
        bgLayer.style.opacity = settings.wallpaperOpacity !== undefined ? settings.wallpaperOpacity : '0.9';
      } else if (wallpaperId === 'custom' && customWallpaperData) {
        bgLayer.style.backgroundImage = `url("${customWallpaperData}")`;
        bgLayer.style.backgroundSize = settings.wallpaperFit || 'cover';
        bgLayer.style.backgroundRepeat = settings.wallpaperFit === 'repeat' ? 'repeat' : 'no-repeat';
        bgLayer.style.backgroundPosition = 'center';
        bgLayer.style.opacity = settings.wallpaperOpacity !== undefined ? settings.wallpaperOpacity : '0.88';
      } else if (wallpaperId === 'none' || !WALLPAPERS[wallpaperId] || !WALLPAPERS[wallpaperId].svg) {
        bgLayer.style.backgroundImage = 'none';
        bgLayer.style.opacity = '0';
      } else {
        const wp = WALLPAPERS[wallpaperId];
        bgLayer.style.backgroundImage = svgToDataUrl(wp.svg);
        bgLayer.style.backgroundSize = wallpaperId === 'warm-terrazzo' ? '260px 260px' : 'cover';
        bgLayer.style.backgroundRepeat = wallpaperId === 'warm-terrazzo' ? 'repeat' : 'no-repeat';
        bgLayer.style.backgroundPosition = 'center';
        bgLayer.style.opacity = settings.wallpaperOpacity !== undefined ? settings.wallpaperOpacity : '0.95';
      }
    });

    // 6. Data attributes for CSS rules (card style, tab style, density, actions mode, avatar shape, ambient effect)
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-wallpaper', wallpaperId);
    root.setAttribute('data-card-style', cardStyle);
    root.setAttribute('data-card-density', settings.cardDensity || 'cozy');
    root.setAttribute('data-card-actions', settings.cardActionsMode || 'always');
    root.setAttribute('data-avatar-shape', settings.avatarShape || 'squircle');
    root.setAttribute('data-left-accent', settings.showLeftAccent !== false ? 'on' : 'off');
    root.setAttribute('data-tab-style', settings.tabStyle || 'glass-pills');
    root.setAttribute('data-ambient', settings.ambientEffect || 'sunbeams');
  }

  global.PocketMailThemes = {
    THEMES,
    WALLPAPERS,
    svgToDataUrl,
    applyThemeAndWallpaper
  };
})(typeof window !== 'undefined' ? window : this);
