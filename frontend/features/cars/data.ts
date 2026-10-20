import type { ImageProps } from "next/image";
import audiA3 from "../../assets/Assets/Audi-A3-Right-Front-Three-Quarter-165478.jpg";
import audiEtron from "../../assets/Assets/Audi-etron-Exterior-170076.jpg";
import audiRs7 from "../../assets/Assets/Audi-RS7-Sportback-Right-Front-Three-Quarter-83816.jpg";
import audiA8 from "../../assets/Assets/Audi-New-A8-L-Exterior-170120.jpg";

export type CarListing = {
  id: string;
  ownerId: string;
  name: string;
  make: string;
  model: string;
  year: number;
  price: number;
  displayPrice: string;
  kilometres: string;
  fuel: string;
  transmission: string;
  location: string;
  description: string;
  tag: string;
  image: ImageProps["src"];
};

export type CarApiResponse = {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number;
  price: number | string;
  kilometres: number;
  fuel: string;
  transmission: string;
  location: string;
  description: string;
  image_url: string | null;
  is_demo: boolean;
  status: string;
};

const fallbackImages: ImageProps["src"][] = [audiA3, audiEtron, audiA8, audiRs7];

export function formatCarPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

export function mapCarListing(car: CarApiResponse, index: number): CarListing {
  const price = Number(car.price);
  return {
    id: car.id,
    ownerId: car.owner_id,
    name: `${car.make} ${car.model}`,
    make: car.make,
    model: car.model,
    year: car.year,
    price,
    displayPrice: formatCarPrice(price),
    kilometres: `${new Intl.NumberFormat("en-IN").format(car.kilometres)} km`,
    fuel: car.fuel.charAt(0).toUpperCase() + car.fuel.slice(1),
    transmission: car.transmission.charAt(0).toUpperCase() + car.transmission.slice(1),
    location: car.location,
    description: car.description,
    tag: car.is_demo ? "Demo listing" : "Driver listing",
    image:
      car.image_url?.startsWith("/uploads/")
        ? `/api/cars${car.image_url}`
        : fallbackImages[index % fallbackImages.length],
  };
}
