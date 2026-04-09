const EN = {
  'lang.en': 'English',
  'lang.zhHant': '繁體中文',
  'lang.switch': 'Language',

  'period.all': 'All Periods',
  'period.antiquity': 'Antiquity',
  'period.middle_ages': 'Middle Ages',
  'period.renaissance': 'Renaissance',
  'period.baroque': 'Baroque',
  'period.impressionism': 'Impressionism',
  'period.modern': 'Modern',
  'period.contemporary': 'Contemporary',

  'timeline.label': 'Timeline',
  'timeline.clear': 'Clear',
  'timeline.filtersAria': 'Time period filters',
  'timeline.sliderAria': 'Time period timeline',

  'cluster.artworksCount': '{{count}} artworks',
  'cluster.cityCount': '{{city}} ({{count}})',
  'cluster.multipleArtists': 'Multiple artists',
  'cluster.variousYears': 'Various years',
  'cluster.multipleMuseums': 'Multiple museums',
  'cluster.zoomExplore': 'Zoom in to explore {{count}} artworks in this area.',

  'unknown.museum': 'Unknown Museum',
  'unknown.artist': 'Unknown Artist',
  'unknown.medium': 'Unknown medium',
  'unknown.year': 'Unknown',
  'unknown.title': 'Untitled',
  'fallback.prose':
    '{{title}} is a notable work by {{artist}}. Historical background will be expanded in future dataset updates.',

  'panel.clusterTitle': 'Artworks in this area',
  'panel.clusterHint': '{{count}} artworks — choose one to view details',
  'panel.clusterSearchPlaceholder': 'Search by title, artist, or museum',
  'panel.clusterSearchAria': 'Search artworks in this cluster',
  'panel.clusterListAria': 'Artworks in this map cluster',
  'panel.detailsTitle': 'Artwork Details',
  'panel.collectionSuffix': ' Collection',
  'panel.close': 'Close',
  'panel.closeAria': 'Close artwork side panel',
  'panel.museumCount': '{{count}} artworks at this museum',
  'panel.museumSearchPlaceholder': 'Search artworks by title or artist',
  'panel.museumSearchAria': 'Search artworks in this museum',
  'panel.museumListAria': 'Artworks in this museum',
  'panel.noSearchResults': 'No artworks match your search.',
  'panel.zoomOutAria': 'Zoom out image',
  'panel.zoomInAria': 'Zoom in image',
  'panel.resetZoomAria': 'Reset image zoom',
  'panel.reset': 'Reset',
  'panel.artist': 'Artist',
  'panel.year': 'Year',
  'panel.medium': 'Medium',
  'panel.location': 'Current Location',
  'panel.openArtworkAria': 'Open {{title}} by {{artist}}',
  'panel.unavailable': 'Details for this selection could not be loaded. Close and try again.',

  'marker.clusterAria': '{{count}} artworks cluster',
  'marker.artworkAria': '{{title}} by {{artist}}',
  'marker.openClusterAria': 'Open cluster of {{count}} artworks',
  'marker.openArtwork': 'Open details for {{title}}',

  'locatedAt': 'Located at {{name}}.',

  'search.placeholder': 'Search by title, artist, museum, or city',
  'search.ariaLabel': 'Search artworks',
  'search.noResults': 'No artworks match your search.',
  'search.resultsAria': 'Search results',
  'stats.title': 'Dataset Stats',
  'stats.periodFilterTitle': 'Filter by Period',
  'stats.visible': 'Visible',
  'stats.loaded': 'Loaded',
  'stats.total': 'Total',
  'stats.bySource': 'By source',
  'stats.byPeriod': 'By period',
  'stats.clear': 'Clear',
  'stats.results': 'Matching artworks',
  'stats.empty': 'No artworks in this category.',
  'stats.filtersActive': 'Filters active',
  'controls.zoomInAria': 'Zoom in',
  'controls.zoomOutAria': 'Zoom out',

  'submit.link': 'Submit art',
  'submit.cta': '+ Contribute Art',
  'submit.ctaSub': "Help map the world's art",
  'submit.curatorBanner':
    'Thank you for contributing! To maintain the quality of our globe, all submissions are reviewed by our curators before going live.',
  'submit.title': 'Submit artwork',
  'submit.signInBlurb': 'Sign in with Google or GitHub to upload an image and metadata. Submissions are reviewed before appearing on the globe.',
  'submit.signInGoogle': 'Continue with Google',
  'submit.signInGitHub': 'Continue with GitHub',
  'submit.backGlobe': 'Back to globe',
  'submit.notConfigured': 'Submissions are not available in this build (Supabase URL and anon key are not set).',
  'submit.loadingAuth': 'Loading…',
  'submit.signedInAs': 'Signed in as {{email}}',
  'submit.signOut': 'Sign out',
  'submit.image': 'Image (JPEG, PNG, WebP, or GIF, max 8 MB)',
  'submit.fieldTitle': 'Title',
  'submit.fieldArtist': 'Artist',
  'submit.fieldMuseum': 'Museum or collection',
  'submit.fieldCity': 'City',
  'submit.fieldCountry': 'Country (optional)',
  'submit.fieldLat': 'Latitude',
  'submit.fieldLng': 'Longitude',
  'submit.fieldPeriod': 'Time period',
  'submit.fieldYear': 'Year or range (optional)',
  'submit.fieldMedium': 'Medium (optional)',
  'submit.fieldDescription': 'Description (optional)',
  'submit.fileTooLarge': 'File is too large (max 8 MB).',
  'submit.fileType': 'Please choose a JPEG, PNG, WebP, or GIF image.',
  'submit.needImage': 'Please choose an image to upload.',
  'submit.requiredFields': 'Title, artist, museum, and city are required.',
  'submit.invalidLatLng': 'Enter valid latitude (−90…90) and longitude (−180…180).',
  'submit.submit': 'Submit for review',
  'submit.submitting': 'Submitting…',
  'submit.cancel': 'Cancel',
  'submit.thanksTitle': 'Success!',
  'submit.thanksBody':
    'Success! Your artwork has been submitted and is pending review by our team. It will appear on the globe shortly.',
  'submit.fieldLocation': 'Location (e.g., Paris, France or Shinjuku, Tokyo)',
  'submit.fieldLocationPlaceholder': 'Paris, France',
  'submit.geocodeError':
    "We couldn't find that location. Please try adding a city or country name.",
  'submit.imagesLabel': 'Images',
  'submit.dropHint': 'Drag images here or',
  'submit.browseFiles': 'browse',
  'submit.imagesFormats': 'JPEG, PNG, WebP, or GIF · up to 8 MB each · multiple files ok',
  'submit.requireOneImage': 'Please add at least one image.',
  'submit.removeImage': 'Remove image',
  'submit.requiredFieldsFrictionless': 'Please enter title, artist, museum or collection, and location.',
  'submit.fileTooLargeNamed': '"{{name}}" is too large (max 8 MB per file).',
  'submit.fileTypeNamed': '"{{name}}" must be a JPEG, PNG, WebP, or GIF.',

  'moderate.link': 'Moderate',
  'moderate.title': 'Moderation queue',
  'moderate.notConfigured': 'Moderation requires Supabase environment variables.',
  'moderate.loading': 'Loading…',
  'moderate.needSignIn': 'Sign in with an admin account to continue.',
  'moderate.forbidden': 'You do not have access to moderation.',
  'moderate.empty': 'No pending submissions.',
  'moderate.noPreview': 'Preview unavailable.',
  'moderate.coords': 'Coordinates: {{lat}}, {{lng}}',
  'moderate.reviewerNote': 'Note (optional, stored with the decision)',
  'moderate.approve': 'Approve',
  'moderate.reject': 'Reject',
  'moderate.working': 'Working…'
}

const ZH_HANT = {
  'lang.en': 'English',
  'lang.zhHant': '繁體中文',
  'lang.switch': '語言',

  'period.all': '全部時期',
  'period.antiquity': '古代',
  'period.middle_ages': '中世紀',
  'period.renaissance': '文藝復興',
  'period.baroque': '巴洛克',
  'period.impressionism': '印象派',
  'period.modern': '現代',
  'period.contemporary': '當代',

  'timeline.label': '時間軸',
  'timeline.clear': '清除',
  'timeline.filtersAria': '時期篩選',
  'timeline.sliderAria': '時期時間軸',

  'cluster.artworksCount': '{{count}} 件藝術品',
  'cluster.cityCount': '{{city}}（{{count}}）',
  'cluster.multipleArtists': '多位藝術家',
  'cluster.variousYears': '年代不一',
  'cluster.multipleMuseums': '多間博物館',
  'cluster.zoomExplore': '放大檢視此區域的 {{count}} 件藝術品。',

  'unknown.museum': '未知博物館',
  'unknown.artist': '未知藝術家',
  'unknown.medium': '媒材未詳',
  'unknown.year': '不詳',
  'unknown.title': '無題',
  'fallback.prose':
    '《{{title}}》是{{artist}}的知名作品；歷史背景將在日後資料更新中擴充。',

  'panel.clusterTitle': '此區域的藝術品',
  'panel.clusterHint': '共 {{count}} 件 — 請點選以檢視詳情',
  'panel.clusterSearchPlaceholder': '以標題、藝術家或博物館搜尋',
  'panel.clusterSearchAria': '搜尋此叢集內的藝術品',
  'panel.clusterListAria': '地圖叢集內的藝術品',
  'panel.detailsTitle': '藝術品詳情',
  'panel.collectionSuffix': ' 典藏',
  'panel.close': '關閉',
  'panel.closeAria': '關閉側邊詳情面板',
  'panel.museumCount': '本館共 {{count}} 件藝術品',
  'panel.museumSearchPlaceholder': '以標題或藝術家搜尋',
  'panel.museumSearchAria': '搜尋此博物館館藏',
  'panel.museumListAria': '此博物館的藝術品',
  'panel.noSearchResults': '沒有符合搜尋條件的藝術品。',
  'panel.zoomOutAria': '縮小圖片',
  'panel.zoomInAria': '放大圖片',
  'panel.resetZoomAria': '重設圖片縮放',
  'panel.reset': '重設',
  'panel.artist': '藝術家',
  'panel.year': '年代',
  'panel.medium': '媒材',
  'panel.location': '目前地點',
  'panel.openArtworkAria': '開啟 {{title}}，{{artist}}',
  'panel.unavailable': '無法載入此選項的詳情，請關閉後再試。',

  'marker.clusterAria': '{{count}} 件藝術品叢集',
  'marker.artworkAria': '{{title}}，{{artist}}',
  'marker.openClusterAria': '開啟含 {{count}} 件藝術品的叢集',
  'marker.openArtwork': '開啟 {{title}} 詳情',

  'locatedAt': '位於{{name}}。',

  'search.placeholder': '以標題、藝術家、博物館或城市搜尋',
  'search.ariaLabel': '搜尋藝術品',
  'search.noResults': '沒有符合搜尋條件的藝術品。',
  'search.resultsAria': '搜尋結果',
  'stats.title': '資料統計',
  'stats.periodFilterTitle': '依時期篩選',
  'stats.visible': '目前顯示',
  'stats.loaded': '已載入',
  'stats.total': '總數',
  'stats.bySource': '依來源',
  'stats.byPeriod': '依時期',
  'stats.clear': '清除',
  'stats.results': '符合的藝術品',
  'stats.empty': '此分類沒有藝術品。',
  'stats.filtersActive': '已啟用篩選',
  'controls.zoomInAria': '放大地球',
  'controls.zoomOutAria': '縮小地球',

  'submit.link': '提交作品',
  'submit.cta': '+ 貢獻藝術作品',
  'submit.ctaSub': '一起豐富全球藝術地圖',
  'submit.curatorBanner':
    '感謝您的貢獻！為維持地球儀上的品質，所有投稿都會由策展人審核通過後才會上線。',
  'submit.title': '提交藝術作品',
  'submit.signInBlurb': '使用 Google 或 GitHub 登入以上傳圖片與詮釋資料。作品需經審核後才會出現於地球儀。',
  'submit.signInGoogle': '以 Google 繼續',
  'submit.signInGitHub': '以 GitHub 繼續',
  'submit.backGlobe': '返回地球儀',
  'submit.notConfigured': '此版本未設定 Supabase，無法使用提交功能。',
  'submit.loadingAuth': '載入中…',
  'submit.signedInAs': '已登入：{{email}}',
  'submit.signOut': '登出',
  'submit.image': '圖片（JPEG、PNG、WebP 或 GIF，最大 8 MB）',
  'submit.fieldTitle': '標題',
  'submit.fieldArtist': '藝術家',
  'submit.fieldMuseum': '博物館或典藏',
  'submit.fieldCity': '城市',
  'submit.fieldCountry': '國家（選填）',
  'submit.fieldLat': '緯度',
  'submit.fieldLng': '經度',
  'submit.fieldPeriod': '時期',
  'submit.fieldYear': '年代（選填）',
  'submit.fieldMedium': '媒材（選填）',
  'submit.fieldDescription': '說明（選填）',
  'submit.fileTooLarge': '檔案過大（上限 8 MB）。',
  'submit.fileType': '請選擇 JPEG、PNG、WebP 或 GIF 圖檔。',
  'submit.needImage': '請選擇要上傳的圖片。',
  'submit.requiredFields': '請填寫標題、藝術家、博物館與城市。',
  'submit.invalidLatLng': '請輸入有效的緯度（−90…90）與經度（−180…180）。',
  'submit.submit': '送出審核',
  'submit.submitting': '送出中…',
  'submit.cancel': '取消',
  'submit.thanksTitle': '提交成功',
  'submit.thanksBody':
    '提交成功！您的作品已送出，正由團隊審核中，通過後不久將會顯示於地球儀上。',
  'submit.fieldLocation': '地點（例：Paris, France 或日本東京新宿）',
  'submit.fieldLocationPlaceholder': '臺北市，臺灣',
  'submit.geocodeError': '找不到此地點，請改為更完整的城市或國家名稱後再試。',
  'submit.imagesLabel': '圖片',
  'submit.dropHint': '將圖片拖放到此，或',
  'submit.browseFiles': '點此選擇檔案',
  'submit.imagesFormats': 'JPEG、PNG、WebP 或 GIF · 每張最大 8 MB · 可複選多張',
  'submit.requireOneImage': '請至少上傳一張圖片。',
  'submit.removeImage': '移除圖片',
  'submit.requiredFieldsFrictionless': '請填寫標題、藝術家、博物館或典藏與地點。',
  'submit.fileTooLargeNamed': '「{{name}}」超過大小上限（每張 8 MB）。',
  'submit.fileTypeNamed': '「{{name}}」必須為 JPEG、PNG、WebP 或 GIF。',

  'moderate.link': '審核',
  'moderate.title': '審核佇列',
  'moderate.notConfigured': '審核功能需要 Supabase 環境變數。',
  'moderate.loading': '載入中…',
  'moderate.needSignIn': '請以管理員帳號登入。',
  'moderate.forbidden': '您沒有審核權限。',
  'moderate.empty': '目前沒有待審項目。',
  'moderate.noPreview': '無法預覽圖片。',
  'moderate.coords': '座標：{{lat}}，{{lng}}',
  'moderate.reviewerNote': '備註（選填，將一併記錄）',
  'moderate.approve': '核准',
  'moderate.reject': '退件',
  'moderate.working': '處理中…'
}

const TABLES = { en: EN, zhHant: ZH_HANT }

export const LOCALES = ['en', 'zhHant']

const STORAGE_KEY = 'art-globe-locale'

export function readStoredLocale() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'zhHant' || raw === 'en') return raw
  } catch {
    /* ignore */
  }
  return 'en'
}

export function writeStoredLocale(locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
}

export function translate(locale, key, vars = {}) {
  const table = TABLES[locale] ?? EN
  let s = table[key] ?? EN[key] ?? key
  Object.entries(vars).forEach(([k, v]) => {
    s = s.split(`{{${k}}}`).join(String(v))
  })
  return s
}

export function periodLabel(locale, periodKey) {
  return translate(locale, `period.${periodKey}`)
}
