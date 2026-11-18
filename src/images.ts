const normalize = (s: string) =>
    s.toLowerCase().replace(/['-]/g, "").replace(/[ ]/g, "_");

const uiIcons = new Set(["close", "error", "left", "right"]);

export function getImage(image: string) {
    const key = normalize(image);
    const category = uiIcons.has(key) ? "ui" : "conditions";
    return `/images/${category}/${key}.webp`;
}