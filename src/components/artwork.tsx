import type { Product } from "@/lib/shop";

export function Artwork({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const [a, b, c] = product.palette;
  const variant = ["good-company", "a-little-balance", "in-good-shape"].indexOf(
    product.id,
  );
  return (
    <svg
      className={className}
      viewBox="0 0 300 380"
      role="img"
      aria-label={`${product.name}, ${product.category.toLowerCase()} artwork by ${product.artist}`}
    >
      <rect width="300" height="380" fill={product.background} />
      {product.category === "Botanical" ? (
        <>
          <path
            d="M147 323 Q158 230 141 133 M149 257 Q113 219 88 185 M149 222 Q183 180 210 149 M143 174 Q117 142 107 104 M145 145 Q168 111 176 77"
            fill="none"
            stroke={a}
            strokeWidth="4"
          />
          <ellipse
            cx="96"
            cy="185"
            rx="24"
            ry="53"
            transform="rotate(-43 96 185)"
            fill={a}
          />
          <ellipse
            cx="198"
            cy="170"
            rx="24"
            ry="54"
            transform="rotate(40 198 170)"
            fill={a}
          />
          <ellipse
            cx="111"
            cy="120"
            rx="19"
            ry="42"
            transform="rotate(-24 111 120)"
            fill={b}
          />
          <ellipse
            cx="175"
            cy="98"
            rx="18"
            ry="44"
            transform="rotate(25 175 98)"
            fill={b}
          />
          <ellipse
            cx="119"
            cy="248"
            rx="19"
            ry="44"
            transform="rotate(-48 119 248)"
            fill={b}
          />
          <ellipse
            cx="181"
            cy="234"
            rx="18"
            ry="43"
            transform="rotate(45 181 234)"
            fill={a}
          />
          <path d="M110 293 H190 L179 351 H121Z" fill={c} />
          <ellipse cx="150" cy="293" rx="40" ry="7" fill={c} />
        </>
      ) : product.category === "Landscape" ? (
        <>
          <circle cx="210" cy="113" r="43" fill={c} />
          <path d="M0 224 Q78 112 166 213 T320 187 V380 H0Z" fill={a} />
          <path d="M0 276 Q100 190 198 267 T320 250 V380 H0Z" fill={b} />
          <path d="M0 342 Q80 262 183 318 T320 301 V380 H0Z" fill={c} />
          <path
            d="M122 380 Q210 289 169 243"
            fill="none"
            stroke={product.background}
            strokeWidth="3"
            opacity=".6"
          />
        </>
      ) : variant === 0 ? (
        <>
          <path d="M48 198 A77 77 0 0 1 202 198 V296 H48Z" fill={a} />
          <circle cx="203" cy="114" r="48" fill={b} />
          <path d="M141 226 H253 V316 H141Z" fill={c} />
          <path d="M82 246 H113 V317 H82Z" fill={product.background} />
        </>
      ) : variant === 1 ? (
        <>
          <ellipse cx="150" cy="300" rx="92" ry="31" fill={a} />
          <path d="M101 263 L137 157 L213 263Z" fill={b} />
          <circle cx="153" cy="117" r="43" fill={c} />
          <path d="M54 167 H89 V259 H54Z" fill={a} />
        </>
      ) : variant === 2 ? (
        <>
          <path d="M42 104 H153 V276 H42Z" fill={a} />
          <path d="M162 67 A85 85 0 0 1 162 237Z" fill={b} />
          <circle cx="160" cy="290" r="55" fill={c} />
          <circle cx="97" cy="191" r="29" fill={product.background} />
        </>
      ) : (
        <>
          <circle cx="154" cy="131" r="79" fill={b} />
          <path d="M52 176 A77 77 0 0 1 206 176 V325 H52Z" fill={a} />
          <path d="M146 325 V230 A54 54 0 0 1 254 230 V325Z" fill={c} />
          <path
            d="M87 325 V195 A25 25 0 0 1 137 195 V325Z"
            fill={product.background}
          />
        </>
      )}
      {Array.from({ length: 18 }, (_, index) => (
        <path
          key={index}
          d={`M0 ${index * 23} L300 ${index * 23 - 70}`}
          stroke="#fff"
          strokeWidth=".65"
          opacity=".1"
        />
      ))}
    </svg>
  );
}
