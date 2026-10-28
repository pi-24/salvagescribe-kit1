import { readFileSync } from "node:fs";
import path from "node:path";
import { createPart, readiness } from "./platform-engine.js";

export function marketplaceRecords() {
  const listings = JSON.parse(readFileSync(path.join(process.cwd(), "data/marketplace_listings.json"), "utf8"));
  return listings.map(listing => {
    const year = listing.donorVehicle.match(/\b(?:19|20)\d{2}\b/)?.[0];
    const make = ["Mercedes-Benz", "Mitsubishi", "Hyundai", "Toyota", "Nissan", "Honda", "Lexus", "Ford", "BMW"].find(make => listing.title.includes(make));
    const model = listing.donorVehicle.replace(/^\d{4}\s*/, "").replace(make || "", "").trim();
    const type = /mirror/i.test(listing.title) ? "Side-view mirror" : /headlamp/i.test(listing.title) ? "Headlamp" : /tail\s?light/i.test(listing.title) ? "Taillight" : /door handle/i.test(listing.title) ? "Door handle" : /switch/i.test(listing.title) ? "Window switch" : "Interior trim";
    const side = /\bLeft\b/i.test(listing.title) ? "LH" : /\bRight\b/i.test(listing.title) ? "RH" : undefined;
    const ledger = createPart({
      part_id: listing.id, description: listing.title, price_aed: listing.price,
      location: listing.location, donor_year: year, donor_make: make, donor_model: model,
      part_type: type, side, part_number: listing.partNumber,
    });
    // Catalog display metadata does not confirm technical evidence or approval.
    ledger.marketplace_listing = listing;
    ledger.thumbnail = `/marketglass/images/${listing.id}.jpg`;
    return { part_id: ledger.part_id, revision: 0, ledger, listing, thumbnail: ledger.thumbnail, draft: null, readiness: readiness(ledger), preview: true };
  });
}
