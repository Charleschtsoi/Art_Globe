/** Common institution names: English (normalized) -> Traditional Chinese */
const MAP = new Map(
  Object.entries({
    'metropolitan museum of art': '大都會藝術博物館',
    'the metropolitan museum of art': '大都會藝術博物館',
    'courtauld institute of art': '考陶德藝術研究所',
    'national gallery': '國家美術館',
    'the national gallery': '國家美術館',
    'british museum': '大英博物館',
    'the british museum': '大英博物館',
    'louvre': '羅浮宮',
    'the louvre': '羅浮宮',
    'musée du louvre': '羅浮宮',
    'museo del prado': '普拉多博物館',
    'prado museum': '普拉多博物館',
    'rijksmuseum': '荷蘭國立博物館',
    'van gogh museum': '梵谷博物館',
    'state hermitage museum': '冬宮博物館',
    'the hermitage museum': '冬宮博物館',
    'hermitage museum': '冬宮博物館',
    'pushkin museum': '普希金美術館',
    'pushkin museum of fine arts': '普希金美術館',
    'the pushkin state museum of fine arts': '俄羅斯普希金國立美術館',
    'uffizi gallery': '烏菲茲美術館',
    'galleria degli uffizi': '烏菲茲美術館',
    'museum of modern art': '現代藝術博物館',
    'the museum of modern art': '現代藝術博物館',
    'moma': '現代藝術博物館',
    'tate britain': '泰特不列顛',
    'tate modern': '泰特現代藝術館',
    'national gallery of art': '美國國家美術館',
    'smithsonian': '史密森尼',
    'art institute of chicago': '芝加哥藝術博物館',
    'the art institute of chicago': '芝加哥藝術博物館',
    'j. paul getty museum': '蓋蒂中心',
    'getty museum': '蓋蒂中心',
    'los angeles county museum of art': '洛杉磯郡立美術館',
    'national museum of western art': '國立西洋美術館',
    'tokyo national museum': '東京國立博物館',
    'kyoto national museum': '京都國立博物館',
    'mfa boston': '波士頓美術館',
    'museum of fine arts, boston': '波士頓美術館',
    'museum of fine arts boston': '波士頓美術館',
    'harvard art museums': '哈佛藝術博物館',
    'yale university art gallery': '耶魯大學美術館',
    'national palace museum': '國立故宮博物院',
    'national museum of korea': '國立中央博物館',
    'national museum of china': '中國國家博物館',
    'palace museum': '故宮博物院',
    'viktor wynd museum': '維克多·溫德博物館',
    'museum mayer van den bergh': '梅耶・范登貝赫博物館',
    'musée d\'orsay': '奧塞美術館',
    'musee d\'orsay': '奧塞美術館',
    'orsay': '奧塞美術館',
    'church of santo tomé': '聖托梅教堂',
    'von der heydt museum': '馮德海特博物館',
    'von der heydt-museum': '馮德海特博物館'
  }).map(([k, v]) => [k.toLowerCase().trim(), v])
)

export function museumNameToZhHant(englishName) {
  const key = String(englishName ?? '')
    .toLowerCase()
    .trim()
  if (!key) return ''
  if (MAP.has(key)) return MAP.get(key)
  for (const [en, zh] of MAP.entries()) {
    if (key.includes(en) || en.includes(key)) return zh
  }
  return ''
}
