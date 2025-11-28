let quantityRegex = /(?<num>[0-9¼½¾]+)(?:(?<sep>\s*(?:[.,\-–\/]|(?:tot|à|a))\s*)(?<num2>[0-9¼½¾]+))?(?<unit> ?(?:(?<skippableUnit>min(?:uten|uut)?\.?|uur|graden|° ?C?|pers(?:\.|onen))|([^\s\d¼½¾()]*)))(?:(?=[^A-Za-z])|$)/g;

export function markQuantitiesInText(text) {
    if (!text) return text;

    let result = "";
    let lastIndex = 0;
    let match;
    quantityRegex.lastIndex = 0;

    while ((match = quantityRegex.exec(text)) !== null) {
        result += text.slice(lastIndex, match.index);

        if (match.groups.skippableUnit !== undefined) {
            result += match[0]; // leave unchanged (minutes, degrees, etc.)
        } else {
            result += `<span>`;
            result += `<span class="recipe-quantity" data-original="${match.groups.num}">${match.groups.num}</span>`;
            if (match.groups.num2 !== undefined) {
                result += `${match.groups.sep}<span class="recipe-quantity" data-original="${match.groups.num2}">${match.groups.num2}</span>`;
            }
            result += `${match.groups.unit}</span>`;
        }

        lastIndex = quantityRegex.lastIndex;
    }

    result += text.slice(lastIndex);
    return result;
}

export function parseNumber(str) {
    const fracMap = {"¼": 0.25, "½": 0.5, "¾": 0.75};
    str = str.trim();

    // If pure fraction char
    if (fracMap[str] != null) {
        return fracMap[str];
    }

    // If fraction appended to a number (e.g. "1½")
    const lastChar = str.slice(-1);
    if (fracMap[lastChar] != null) {
        const base = parseFloat(str.slice(0, -1)) || 0;
        return base + fracMap[lastChar];
    }

    // If "1/2" or "3/4"
    if (str.includes("/")) {
        const [a, b] = str.split("/").map(Number);
        if (!isNaN(a) && !isNaN(b) && b !== 0) {
            return a / b;
        }
    }

    // Normal decimal or integer
    const num = parseFloat(str.replace(",", "."));
    return isNaN(num) ? null : num;
}

export function formatNumber(num) {
    // Convert a number back into a readable pretty fraction or decimal
    const fracReverse = {0.25: "¼", 0.5: "½", 0.75: "¾"};
    if (num == null || isNaN(num)) return "";

    // Check for whole number
    if (Math.abs(num - Math.round(num)) < 0.01) {
        return String(Math.round(num));
    }

    // Try to match fractions
    const fractional = num - Math.floor(num);
    const roundedFrac = Math.round(fractional * 100) / 100;

    if (fracReverse[roundedFrac] && num < 10) {
        const whole = Math.floor(num);
        return whole > 0 ? `${whole}${fracReverse[roundedFrac]}` : fracReverse[roundedFrac];
    }

    // fallback decimal with at most 2 decimals
    return String(Math.round(num * 100) / 100).replace(".", ",");
}