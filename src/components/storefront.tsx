"use client";
import { useCallback, useMemo, useState } from "react";
import {
  products,
  formatPrice,
  type Product,
  type Category,
  MAX_QUANTITY,
} from "@/lib/shop";
import { Artwork } from "./artwork";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { useShop } from "./shop-provider";

export function Storefront() {
  const [category, setCategory] = useState<Category | "All works">("All works");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [selected, setSelected] = useState<Product | null>(null);
  const { addItem, cart, ready } = useShop();
  const closePreview = useCallback(() => setSelected(null), []);
  const filtered = useMemo(() => {
    const results = products.filter(
      (product) =>
        (category === "All works" || product.category === category) &&
        `${product.name} ${product.artist} ${product.category}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    );
    return sort === "price-low"
      ? results.sort((a, b) => a.price - b.price)
      : sort === "price-high"
        ? results.sort((a, b) => b.price - a.price)
        : sort === "name"
          ? results.sort((a, b) => a.name.localeCompare(b.name))
          : results;
  }, [category, search, sort]);
  function atLimit(id: string) {
    return (
      (cart.find((item) => item.productId === id)?.quantity ?? 0) >=
      MAX_QUANTITY
    );
  }
  return (
    <main>
      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-star">✳</span> A SMALL SHOP FOR BIG FEELINGS
          </span>
          <h1>
            Good art.
            <br />
            Everyday <em>joy.</em>
          </h1>
          <p>
            For the empty wall. The cosy corner. The place
            <br className="desktop-break" /> you call yours. A little art goes a
            long way.
          </p>
          <a href="#collection" className="button primary">
            Find your new favourite <Icon name="arrow" />
          </a>
          <div className="hero-note">
            <span className="note-line" /> Thoughtfully made. Happily
            affordable.
          </div>
        </div>
        <div
          className="hero-gallery"
          aria-label="A selection of our art prints"
        >
          <span className="gallery-caption">
            THE EVERYDAY COLLECTION / VOL. 01
          </span>
          <div className="hero-frame frame-one">
            <Artwork product={products[1]} />
          </div>
          <div className="hero-frame frame-two">
            <Artwork product={products[0]} />
          </div>
          <div className="hero-frame frame-three">
            <Artwork product={products[2]} />
          </div>
          <div className="gallery-shelf" />
          <div className="price-sticker">
            <span>ART FOR</span>
            <strong>₦30–₦50</strong>
            <span>EVERYONE</span>
          </div>
          <span className="gallery-handwriting">
            Your walls will thank you. <span>↗</span>
          </span>
        </div>
      </section>
      <div className="benefits">
        <div className="shell benefits-inner">
          <span>
            <Icon name="frame" />
            Little prints, lots of personality
          </span>
          <span>
            <Icon name="truck" />
            Free standard delivery
          </span>
          <span>
            <Icon name="leaf" />
            Made for everyday spaces
          </span>
        </div>
      </div>
      <section
        className="collection shell"
        id="collection"
        aria-labelledby="collection-heading"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">FIND YOUR KIND OF ART</span>
            <h2 id="collection-heading">A wall worth looking at.</h2>
          </div>
          <p>
            10 little works. Endless possibilities.
            <br />
            All prints ₦30–₦50. All yours to love.
          </p>
        </div>
        <div className="collection-toolbar">
          <div className="filters" aria-label="Filter by category">
            {(["All works", "Abstract", "Botanical", "Landscape"] as const).map(
              (item) => (
                <button
                  key={item}
                  aria-pressed={category === item}
                  className={category === item ? "filter active" : "filter"}
                  onClick={() => setCategory(item)}
                >
                  {item}
                  {item === "All works" && <span>10</span>}
                </button>
              ),
            )}
          </div>
          <label className="sort-label">
            Sort by{" "}
            <select
              aria-label="Sort artworks"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="name">Name: A to Z</option>
            </select>
          </label>
        </div>
        <div className="search-row">
          <p aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "artwork" : "artworks"}{" "}
            to make yourself at home with
          </p>
          <label className="search">
            <Icon name="search" width="17" height="17" />
            <input
              type="search"
              aria-label="Search artworks"
              placeholder="Find a little something…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="product-grid">
          {filtered.map((product) => (
            <article className="product-card" key={product.id}>
              <button
                className="product-image"
                style={{ backgroundColor: product.background }}
                onClick={() => setSelected(product)}
                aria-label={`View ${product.name} details`}
              >
                <div className="print-frame">
                  <Artwork product={product} />
                </div>
                {product.id === "sunroom" && (
                  <span className="product-badge">A little favourite</span>
                )}
                <span className="quick-view">
                  Take a closer look <Icon name="plus" width="15" height="15" />
                </span>
              </button>
              <div className="product-meta">
                <span>{product.category} / A4 print</span>
                <span>
                  NO. {String(products.indexOf(product) + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="product-title">
                <button onClick={() => setSelected(product)}>
                  <h3>{product.name}</h3>
                </button>
                <strong>{formatPrice(product.price)}</strong>
              </div>
              <div className="product-bottom">
                <span>by {product.artist}</span>
                <button
                  className="add-button"
                  disabled={!ready || atLimit(product.id)}
                  onClick={() => addItem(product.id)}
                  aria-label={`Add ${product.name} to bag`}
                >
                  {atLimit(product.id) ? "Bag limit reached" : "Add to bag"}
                  <Icon name="plus" width="16" height="16" />
                </button>
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Icon name="search" width="36" height="36" />
            <h3>No art found just yet.</h3>
            <p>Try another name or explore the whole collection.</p>
            <button
              className="button secondary"
              onClick={() => {
                setSearch("");
                setCategory("All works");
              }}
            >
              Show all artworks
            </button>
          </div>
        )}
        <div className="collection-end">
          <span /> A little something for every wall. <span />
        </div>
      </section>
      <section className="story shell" id="our-story">
        <div className="story-symbol" aria-hidden="true">
          ✳
        </div>
        <div>
          <span className="eyebrow">HELLO, WE’RE FORMA</span>
          <h2>
            Art doesn’t have to be a big thing.
            <br />
            It just has to be <em>your thing.</em>
          </h2>
          <p>
            We’re a small art shop with a simple idea: the spaces you live in
            should feel like you. So we made a little collection of art prints
            that brings colour, calm, and character to everyday life.
          </p>
          <a className="text-link" href="#collection">
            Find a piece of your personality <Icon name="arrow" />
          </a>
        </div>
        <div className="story-note">
          A small print.
          <br />A happy place.<span>with love, forma.</span>
        </div>
      </section>
      {selected && (
        <Dialog title={`${selected.name} details`} onClose={closePreview}>
          <div className="product-detail">
            <div
              className="detail-art"
              style={{ backgroundColor: selected.background }}
            >
              <div className="print-frame">
                <Artwork product={selected} />
              </div>
            </div>
            <div className="detail-copy">
              <span className="eyebrow">
                {selected.category} / THE EVERYDAY COLLECTION
              </span>
              <h2>{selected.name}</h2>
              <p className="detail-artist">by {selected.artist}</p>
              <strong className="detail-price">
                {formatPrice(selected.price)}
              </strong>
              <p>{selected.description}</p>
              <dl>
                <div>
                  <dt>Size</dt>
                  <dd>A4 · 21 × 29.7 cm</dd>
                </div>
                <div>
                  <dt>Finish</dt>
                  <dd>Matte paper, unframed</dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>Standard delivery included</dd>
                </div>
              </dl>
              <button
                className="button primary full-width"
                disabled={!ready || atLimit(selected.id)}
                onClick={() => {
                  addItem(selected.id);
                  setSelected(null);
                }}
              >
                {atLimit(selected.id)
                  ? "Maximum 10 per artwork"
                  : `Add to bag — ${formatPrice(selected.price)}`}
                <Icon name="plus" />
              </button>
              <span className="detail-disclaimer">
                Demo product · Frame shown for styling only.
              </span>
            </div>
          </div>
        </Dialog>
      )}
    </main>
  );
}
