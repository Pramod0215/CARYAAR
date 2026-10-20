import Image from "next/image";
import { ArrowUpRight, Heart, MapPin } from "lucide-react";
import type { CarListing } from "@/features/cars/data";

type CarCardProps = {
  car: CarListing;
  isSaved: boolean;
  onToggleSaved: (id: string) => void;
  onViewDetails: (car: CarListing) => void;
};

export default function CarCard({ car, isSaved, onToggleSaved, onViewDetails }: CarCardProps) {
  return (
    <article className="car-card">
      <div className="car-image-wrap">
        <Image
          alt={`${car.year} ${car.name}`}
          className="car-image"
          src={car.image}
          sizes="(max-width: 720px) 50vw, (max-width: 1000px) 33vw, 400px"
        />
        <span className="car-tag">{car.tag}</span>
        <button
          aria-label={isSaved ? `Remove ${car.name} from saved cars` : `Save ${car.name}`}
          aria-pressed={isSaved}
          className={`save-button${isSaved ? " saved" : ""}`}
          onClick={() => onToggleSaved(car.id)}
          type="button"
        >
          <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={15} />
        </button>
      </div>
      <div className="car-card-body">
        <span className="car-year">{car.year} model</span>
        <h3 className="car-name">{car.name}</h3>
        <div className="listing-meta">
          <span>{car.kilometres}</span>
          <span className="meta-separator" />
          <span>{car.fuel}</span>
          <span className="meta-separator" />
          <MapPin aria-hidden="true" size={11} />
          <span>{car.location}</span>
        </div>
        <div className="card-footer">
          <span className="car-price">{car.displayPrice}</span>
          <button className="details-button" onClick={() => onViewDetails(car)} type="button">
            Details <ArrowUpRight aria-hidden="true" size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
