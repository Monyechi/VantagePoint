/** Lightweight, regex-based site-builder detection from HTML already fetched for
 * analysis — a free substitute for a paid Wappalyzer API subscription. Not
 * exhaustive; covers the DIY builders most relevant to a "you could use a real
 * website" sales angle. */
const TECH_SIGNATURES: { id: string; label: string; pattern: RegExp }[] = [
  { id: "wordpress", label: "WordPress", pattern: /wp-content|wp-includes|\/wp-json\// },
  { id: "wix", label: "Wix", pattern: /static\.wixstatic\.com|wix\.com\/serviceworker/ },
  { id: "squarespace", label: "Squarespace", pattern: /squarespace\.com|static1\.squarespace\.com/ },
  { id: "shopify", label: "Shopify", pattern: /cdn\.shopify\.com|shopify\.com\/s\// },
  { id: "weebly", label: "Weebly", pattern: /weebly\.com|cdn2\.editmysite\.com/ },
  { id: "webflow", label: "Webflow", pattern: /webflow\.com|assets-global\.website-files\.com/ },
  { id: "godaddy_builder", label: "GoDaddy Website Builder", pattern: /godaddysites\.com|gdwebsitebuilder/ },
];

/** Builders commonly framed as a "you've outgrown this" opportunity signal. */
export const DIY_BUILDER_IDS = new Set(["wix", "squarespace", "weebly", "godaddy_builder"]);

export function detectTech(html: string): { id: string; label: string }[] {
  const found: { id: string; label: string }[] = [];
  for (const sig of TECH_SIGNATURES) {
    if (sig.pattern.test(html)) found.push({ id: sig.id, label: sig.label });
  }
  return found;
}
