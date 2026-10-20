"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CarFront,
  ChevronDown,
  CircleUserRound,
  Heart,
  KeyRound,
  Leaf,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import CarCard from "@/components/marketplace/car-card";
import { useAuth } from "@/features/auth/auth-context";
import {
  mapCarListing,
  type CarApiResponse,
  type CarListing,
} from "@/features/cars/data";
import { apiRequest } from "@/lib/api";
import heroCar from "../../assets/Assets/Audi-etron-Exterior-170076.jpg";

type DialogState = "signin" | "sell" | "edit" | CarListing | null;
type PriceFilter = "all" | "under-50" | "electric" | "saved" | "mine";
type AuthMode = "login" | "register";

const DEMO_PREVIEW_MIN_PRICE = 5_000_000;

function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className={`dialog${wide ? " wide" : ""}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-header">
          <h2 className="dialog-title">{title}</h2>
          <button aria-label="Close dialog" className="dialog-close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function Marketplace() {
  const { isLoading: authLoading, signIn, signOut, signUp, user } = useAuth();
  const [query, setQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortOrder, setSortOrder] = useState("recommended");
  const [cars, setCars] = useState<CarListing[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [carsError, setCarsError] = useState("");
  const [reloadCars, setReloadCars] = useState(0);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [editingCar, setEditingCar] = useState<CarListing | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [createdCarId, setCreatedCarId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: "100" });
      const search = query.trim();
      const isMyListings = priceFilter === "mine";
      if (search && !isMyListings) params.set("search", search);
      if (priceFilter === "under-50") {
        params.set("max_price", String(DEMO_PREVIEW_MIN_PRICE - 0.01));
      }
      if (priceFilter === "electric") params.set("fuel", "electric");

      setCarsLoading(true);
      setCarsError("");
      apiRequest<CarApiResponse[]>(`${isMyListings ? "/api/cars/mine" : "/api/cars"}?${params}`, {
        signal: controller.signal,
      })
        .then((results) => {
          const listings = results.map(mapCarListing);
          if (isMyListings && search) {
            const term = search.toLocaleLowerCase();
            setCars(
              listings.filter((car) =>
                `${car.name} ${car.location} ${car.fuel} ${car.year}`
                  .toLocaleLowerCase()
                  .includes(term),
              ),
            );
          } else {
            setCars(listings);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setCarsError(error instanceof Error ? error.message : "Could not load car listings.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setCarsLoading(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, priceFilter, reloadCars]);

  const filteredCars = useMemo(() => {
    const listings =
      priceFilter === "saved"
        ? cars.filter((car) => savedIds.includes(car.id))
        : [...cars];

    if (sortOrder === "price-low") return listings.sort((first, second) => first.price - second.price);
    if (sortOrder === "price-high") return listings.sort((first, second) => second.price - first.price);
    if (sortOrder === "newest") return listings.sort((first, second) => second.year - first.year);
    return listings;
  }, [cars, priceFilter, savedIds, sortOrder]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setActionError("");
    setActionPending(true);
    try {
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      if (authMode === "register") {
        await signUp(String(formData.get("name") ?? "").trim(), email, password);
      } else {
        await signIn(email, password);
      }
      setDialog(null);
      showToast(authMode === "register" ? "Your account is ready." : "You’re signed in.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleSellRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selectedImage = formData.get("image");
    const image = selectedImage instanceof File && selectedImage.size > 0 ? selectedImage : null;
    setActionError("");
    setActionPending(true);
    let listingSaved = Boolean(createdCarId);
    try {
      if (image && image.size > 5 * 1024 * 1024) {
        throw new Error("Car photos must be 5 MB or smaller.");
      }
      let listingId = createdCarId;
      const listingPayload = {
        make: String(formData.get("make") ?? "").trim(),
        model: String(formData.get("model") ?? "").trim(),
        year: Number(formData.get("year")),
        price: Number(formData.get("price")),
        kilometres: Number(formData.get("kilometres")),
        fuel: String(formData.get("fuel") ?? ""),
        transmission: String(formData.get("transmission") ?? ""),
        location: String(formData.get("location") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
      };
      if (editingCar) {
        const updated = await apiRequest<CarApiResponse>(`/api/cars/${editingCar.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...listingPayload, status: "active" }),
        });
        listingId = updated.id;
        listingSaved = true;
      } else if (!listingId) {
        const created = await apiRequest<CarApiResponse>("/api/cars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(listingPayload),
        });
        listingId = created.id;
        listingSaved = true;
        setCreatedCarId(listingId);
      }

      if (image) {
        const body = new FormData();
        body.set("image", image);
        await apiRequest(`/api/cars/${listingId}/image`, { method: "POST", body });
      }

      setCreatedCarId(null);
      setEditingCar(null);
      setDialog(null);
      setQuery("");
      setPriceFilter(editingCar ? "mine" : "all");
      setReloadCars((value) => value + 1);
      showToast(editingCar ? "Your car listing has been updated." : "Your car listing has been published.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not publish the listing.";
      setActionError(
        listingSaved
          ? `Your listing was saved. Fix the issue or choose a photo and retry: ${message}`
          : message,
      );
      if (!createdCarId) setReloadCars((value) => value + 1);
    } finally {
      setActionPending(false);
    }
  }

  async function viewCarDetails(car: CarListing) {
    try {
      const details = await apiRequest<CarApiResponse>(`/api/cars/${car.id}`);
      setDialog(mapCarListing(details, Math.max(0, cars.findIndex((listing) => listing.id === car.id))));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load the car details.");
    }
  }

  async function deleteCarListing(car: CarListing) {
    if (!window.confirm(`Delete your ${car.name} listing? This cannot be undone.`)) return;
    setActionPending(true);
    try {
      await apiRequest<void>(`/api/cars/${car.id}`, { method: "DELETE" });
      setDialog(null);
      setPriceFilter("mine");
      setReloadCars((value) => value + 1);
      showToast("Your listing has been deleted.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete this listing.");
    } finally {
      setActionPending(false);
    }
  }

  async function askAboutCar(car: CarListing) {
    if (!user) {
      setAuthMode("login");
      setActionError("");
      setDialog("signin");
      return;
    }
    setActionPending(true);
    try {
      const ticket = await apiRequest<{ id: string }>("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          topic: "buying",
          message: `I am interested in the ${car.year} ${car.name} in ${car.location}, listed for ${car.displayPrice}. Please help me contact the seller. Listing reference: ${car.id}.`,
        }),
      });
      setDialog(null);
      showToast(`Your enquiry was sent to CarYAAR support. Reference: ${ticket.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not send your enquiry.");
    } finally {
      setActionPending(false);
    }
  }

  function toggleSaved(id: string) {
    setSavedIds((current) =>
      current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id],
    );
  }

  const selectedCar = typeof dialog === "object" && dialog !== null ? dialog : null;

  return (
    <>
      <div className="page-shell">
        <header className="site-header">
          <a aria-label="CarYAAR home" className="brand" href="#top">
            <span className="brand-mark"><CarFront aria-hidden="true" size={21} /></span>
            car<span>YAAR</span>
          </a>
          <nav aria-label="Main navigation" className="header-nav">
            <a href="#cars">Buy a car</a>
            <a href="#sell" onClick={(event) => { event.preventDefault(); setEditingCar(null); setCreatedCarId(null); setActionError(""); setDialog("sell"); }}>Sell a car</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="header-actions">
            {user ? (
              <button className="sign-in-button" onClick={() => {
                void signOut()
                  .then(() => showToast("You’re signed out."))
                  .catch((error: unknown) => showToast(error instanceof Error ? error.message : "Could not sign out."));
              }} type="button">
                <CircleUserRound aria-hidden="true" size={16} /> Sign out
              </button>
            ) : (
              <button className="sign-in-button" onClick={() => { setAuthMode("login"); setActionError(""); setDialog("signin"); }} type="button">
                <CircleUserRound aria-hidden="true" size={16} /> {authLoading ? "Loading…" : "Sign in"}
              </button>
            )}
            <button className="sell-button" onClick={() => { setEditingCar(null); setCreatedCarId(null); setActionError(""); setDialog("sell"); }} type="button">
              Sell your car <ArrowUpRight aria-hidden="true" size={14} />
            </button>
          </div>
        </header>

        <main id="top">
          <section aria-labelledby="hero-title" className="hero">
            <div className="hero-copy">
              <span className="eyebrow"><span className="eyebrow-dot" /> A better way to find your next car</span>
              <h1 id="hero-title">Good cars.<br />Good people.<br /><span>Great journeys.</span></h1>
              <p className="hero-description">Find a car worth falling for, or find the right person for the one you love.</p>
              <form className="hero-search" onSubmit={(event) => { event.preventDefault(); document.getElementById("cars")?.scrollIntoView({ behavior: "smooth" }); }}>
                <label className="search-field">
                  <Search aria-hidden="true" size={17} />
                  <input
                    aria-label="Search cars, fuel type, or city"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Try “electric” or “Bengaluru”"
                    value={query}
                  />
                </label>
                <button className="search-button" type="submit">Find a car <ArrowRight aria-hidden="true" size={14} /></button>
              </form>
              <div className="hero-proof" id="how-it-works">
                <span className="hero-proof-item"><ShieldCheck aria-hidden="true" size={14} /> Demo listings included</span>
                <span className="hero-proof-item"><BadgeCheck aria-hidden="true" size={14} /> Clear car details</span>
                <span className="hero-proof-item"><Heart aria-hidden="true" size={14} /> People-first deals</span>
              </div>
            </div>
            <div aria-hidden="true" className="hero-visual">
              <Image alt="" className="hero-car-image" priority src={heroCar} sizes="(max-width: 720px) 100vw, 50vw" />
              <div className="hero-sticker">
                <span className="sticker-icon"><Sparkles aria-hidden="true" size={17} /></span>
                <span><span className="sticker-label">A little more electric</span><span className="sticker-value">Audi e-tron 55 quattro</span></span>
              </div>
            </div>
          </section>

          <section aria-labelledby="cars-title" className="marketplace-section" id="cars">
            <div className="section-heading">
              <div>
                <span className="eyebrow">The good finds</span>
                <h2 className="section-title" id="cars-title">Cars with a story.</h2>
                <p className="section-caption">Browse real listings shared by CarYAAR drivers.</p>
              </div>
            </div>

            <div className="listing-toolbar">
              <div aria-label="Filter cars" className="listing-filters" role="group">
                <button aria-pressed={priceFilter === "all"} className={`filter-chip${priceFilter === "all" ? " active" : ""}`} onClick={() => setPriceFilter("all")} type="button">All cars</button>
                <button aria-pressed={priceFilter === "under-50"} className={`filter-chip${priceFilter === "under-50" ? " active" : ""}`} onClick={() => setPriceFilter("under-50")} type="button"><SlidersHorizontal aria-hidden="true" size={12} /> Under ₹50L</button>
                <button aria-pressed={priceFilter === "electric"} className={`filter-chip${priceFilter === "electric" ? " active" : ""}`} onClick={() => setPriceFilter("electric")} type="button"><Leaf aria-hidden="true" size={12} /> Electric</button>
                <button aria-pressed={priceFilter === "saved"} className={`filter-chip${priceFilter === "saved" ? " active" : ""}`} onClick={() => setPriceFilter("saved")} type="button"><Heart aria-hidden="true" size={12} /> Saved{savedIds.length > 0 ? ` (${savedIds.length})` : ""}</button>
                {user && <button aria-pressed={priceFilter === "mine"} className={`filter-chip${priceFilter === "mine" ? " active" : ""}`} onClick={() => setPriceFilter("mine")} type="button">My listings</button>}
              </div>
              <label className="sort-control">
                <span>Sort:</span>
                <select aria-label="Sort cars" onChange={(event) => setSortOrder(event.target.value)} value={sortOrder}>
                  <option value="recommended">Recommended</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="newest">Newest first</option>
                </select>
                <ChevronDown aria-hidden="true" size={13} />
              </label>
            </div>

            {carsError && <p className="field-error" role="alert">{carsError}</p>}
            <div aria-busy={carsLoading} aria-live="polite" className="car-grid">
              {carsLoading ? (
                <div className="empty-state"><strong>Finding your next car…</strong><span>Loading available listings.</span></div>
              ) : filteredCars.length ? filteredCars.map((car) => (
                <CarCard
                  car={car}
                  isSaved={savedIds.includes(car.id)}
                  key={car.id}
                  onToggleSaved={toggleSaved}
                  onViewDetails={(car) => { void viewCarDetails(car); }}
                />
              )) : (
                <div className="empty-state">
                  <Search aria-hidden="true" size={20} />
                  <strong>No cars found just yet</strong>
                  <span>Try a different search or browse all cars.</span>
                  <button className="details-button" onClick={() => { setQuery(""); setPriceFilter("all"); }} type="button">Clear filters <ArrowRight aria-hidden="true" size={13} /></button>
                </div>
              )}
            </div>
          </section>

          <section aria-label="Sell your car" className="sell-banner" id="sell">
            <div className="sell-banner-copy">
              <span aria-hidden="true" className="sell-banner-icon"><KeyRound size={19} /></span>
              <div><h2>Your car deserves a good next home.</h2><p>Start with the basics. We’ll take it from there.</p></div>
            </div>
            <button className="primary-button" onClick={() => { setEditingCar(null); setCreatedCarId(null); setActionError(""); setDialog("sell"); }} type="button">List your car <ArrowRight aria-hidden="true" size={14} /></button>
          </section>
        </main>

        <footer className="site-footer">
          <span className="footer-brand">carYAAR</span>
          <span>Made for the love of the drive.</span>
          <div className="utility-footer-links">
            <Link href="/support">Support</Link>
            <Link href="/feedback">Feedback</Link>
          </div>
          <span>© 2026 CarYAAR</span>
        </footer>
      </div>

      {dialog === "signin" && (
        <Dialog onClose={() => { setDialog(null); setActionError(""); }} title="Welcome to CarYAAR">
          <p className="dialog-kicker">{authMode === "register" ? "Create your account" : "Sign in"}</p>
          <p className="dialog-description">Sign in to contact sellers or create your secure account.</p>
          <form onSubmit={handleSignIn}>
            {authMode === "register" && <label className="form-field">Your name<input autoComplete="name" maxLength={100} minLength={1} name="name" placeholder="Your name" required /></label>}
            <label className="form-field">Email address<input autoComplete="email" maxLength={254} name="email" placeholder="you@example.com" required type="email" /></label>
            <label className="form-field">Password<input autoComplete={authMode === "register" ? "new-password" : "current-password"} maxLength={128} minLength={authMode === "register" ? 12 : 1} name="password" placeholder={authMode === "register" ? "At least 12 characters" : "Your password"} required type="password" /></label>
            {actionError && <p className="field-error" role="alert">{actionError}</p>}
            <div className="dialog-actions"><button className="primary-button" disabled={actionPending} type="submit">{actionPending ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"} <ArrowRight aria-hidden="true" size={14} /></button></div>
          </form>
          <button className="text-link account-mode-toggle" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setActionError(""); }} type="button">{authMode === "register" ? "Already have an account? Sign in" : "New to CarYAAR? Create an account"}</button>
        </Dialog>
      )}

      {(dialog === "sell" || dialog === "edit") && (
        <Dialog onClose={() => { setDialog(null); setActionError(""); setCreatedCarId(null); setEditingCar(null); }} title={editingCar ? "Edit your car listing" : "Tell us about your car"} wide>
          <p className="dialog-description">{editingCar ? "Update your car details and optionally upload a new photo." : "Share the car details and a clear photo to publish your listing."}</p>
          <form onSubmit={handleSellRequest}>
            <div className="form-grid">
              <label className="form-field">Make<input defaultValue={editingCar?.make ?? ""} name="make" placeholder="e.g. Audi" required /></label>
              <label className="form-field">Model<input defaultValue={editingCar?.model ?? ""} name="model" placeholder="e.g. A4" required /></label>
              <label className="form-field">Year<input aria-label="Model year" defaultValue={editingCar?.year ?? ""} max={new Date().getFullYear() + 1} min="1886" name="year" placeholder="e.g. 2022" required type="number" /></label>
              <label className="form-field">Price (INR)<input defaultValue={editingCar?.price ?? ""} min="0.01" name="price" placeholder="e.g. 2500000" required step="0.01" type="number" /></label>
              <label className="form-field">Kilometres<input defaultValue={editingCar ? Number(editingCar.kilometres.replaceAll(",", "").replace(" km", "")) : ""} max="2000000" min="0" name="kilometres" placeholder="e.g. 32400" required type="number" /></label>
              <label className="form-field">Fuel type<select defaultValue={editingCar?.fuel.toLowerCase() ?? ""} name="fuel" required><option disabled value="">Choose fuel</option><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option><option value="cng">CNG</option><option value="other">Other</option></select></label>
              <label className="form-field">Transmission<select defaultValue={editingCar?.transmission.toLowerCase() ?? ""} name="transmission" required><option disabled value="">Choose transmission</option><option value="manual">Manual</option><option value="automatic">Automatic</option><option value="other">Other</option></select></label>
              <label className="form-field">City<input defaultValue={editingCar?.location ?? ""} maxLength={100} name="location" placeholder="e.g. Bengaluru" required /></label>
              <label className="form-field full">Description<textarea defaultValue={editingCar?.description ?? ""} maxLength={2000} minLength={20} name="description" placeholder="Describe the car, service history and condition…" required rows={4} /></label>
              <label className="form-field full">Car photo (JPEG, PNG, or WebP; up to 5 MB)<input accept="image/jpeg,image/png,image/webp" name="image" required={!editingCar && !createdCarId} type="file" /></label>
            </div>
            {actionError && <p className="field-error" role="alert">{actionError}</p>}
            <div className="dialog-actions"><button className="secondary-button" onClick={() => { setDialog(null); setActionError(""); setCreatedCarId(null); setEditingCar(null); }} type="button">Cancel</button><button className="primary-button" disabled={actionPending} type="submit">{actionPending ? "Saving…" : editingCar ? "Save changes" : createdCarId ? "Retry photo upload" : "Publish listing"} <ArrowRight aria-hidden="true" size={14} /></button></div>
          </form>
        </Dialog>
      )}

      {selectedCar && (
        <Dialog onClose={() => setDialog(null)} title={selectedCar.name} wide>
          <Image alt={`${selectedCar.year} ${selectedCar.name}`} className="dialog-car-image" src={selectedCar.image} unoptimized />
          <p className="detail-price">{selectedCar.displayPrice}</p>
          <p>{selectedCar.description}</p>
          <div className="detail-specs">
            <div className="detail-spec"><span>Year</span>{selectedCar.year}</div>
            <div className="detail-spec"><span>Distance</span>{selectedCar.kilometres}</div>
            <div className="detail-spec"><span>Fuel</span>{selectedCar.fuel}</div>
            <div className="detail-spec"><span>Transmission</span>{selectedCar.transmission}</div>
            <div className="detail-spec"><span>Location</span>{selectedCar.location}</div>
            <div className="detail-spec"><span>Listing</span>{selectedCar.tag}</div>
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => toggleSaved(selectedCar.id)} type="button"><Heart aria-hidden="true" size={14} /> {savedIds.includes(selectedCar.id) ? "Saved" : "Save car"}</button>
            {user?.id === selectedCar.ownerId ? (
              <>
                <button className="secondary-button" onClick={() => { setEditingCar(selectedCar); setActionError(""); setDialog("edit"); }} type="button">Edit listing</button>
                <button className="secondary-button" disabled={actionPending} onClick={() => { void deleteCarListing(selectedCar); }} type="button">Delete listing</button>
              </>
            ) : (
              <button className="primary-button" disabled={actionPending} onClick={() => { void askAboutCar(selectedCar); }} type="button">Ask CarYAAR about this car <ArrowUpRight aria-hidden="true" size={14} /></button>
            )}
          </div>
        </Dialog>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
