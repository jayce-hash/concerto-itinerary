// netlify/functions/itinerary.js
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: "Method Not Allowed" };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const { artist, venue, venueLat, venueLng, eatWhen, foodStyle, budget, hotel } = body;

    if (!venueLat || !venueLng) {
      return json({ error: "Missing venue coordinates" });
    }

    const radius = 2500; // ~1.55 miles
    const [beforeList, afterList] = await Promise.all([
      (eatWhen === "before" || eatWhen === "both") ? searchRestaurants(venueLat, venueLng, radius, foodStyle, budget) : Promise.resolve([]),
      (eatWhen === "after"  || eatWhen === "both") ? searchRestaurants(venueLat, venueLng, radius, foodStyle, budget) : Promise.resolve([]),
    ]);

    const nearby = await searchNearby(venueLat, venueLng, radius, ["tourist_attraction", "bar", "cafe"]);

    const plan = {
      show: { title: `${artist} — Live`, venue },
      diningBefore: beforeList,
      diningAfter: afterList,
      nearby,
      hotel: hotel ? { name: hotel, address: "", distance: null, mapUrl: "" } : null,
      tips: ["Arrive early for merch.", "Check the venue’s bag policy.", "Use the official rideshare lot."]
    };

    return json(plan);
  } catch (e) {
    return json({
      show:{ title:"Your Concert", venue:"Selected Venue" },
      diningBefore: [], diningAfter: [], nearby: [], tips: []
    });
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  };
}
function json(obj){ return { statusCode: 200, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(obj) }; }

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Bad response");
  return await res.json();
};

// Map $ -> Google price range
function priceBounds(budget){
  switch (budget){
    case "$": return [0,1];
    case "$$": return [1,2];
    case "$$$": return [2,3];
    case "$$$$": return [3,4];
    default: return [0,4];
  }
}

// Restaurant search using Nearby Search + optional text keyword
async function searchRestaurants(lat, lng, radius, keyword, budget){
  const [minp, maxp] = priceBounds(budget);
  const nearbyUrl = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  nearbyUrl.searchParams.set("location", `${lat},${lng}`);
  nearbyUrl.searchParams.set("radius", String(radius));
  nearbyUrl.searchParams.set("type", "restaurant");
  if (keyword) nearbyUrl.searchParams.set("keyword", keyword);
  nearbyUrl.searchParams.set("minprice", String(minp));
  nearbyUrl.searchParams.set("maxprice", String(maxp));
  nearbyUrl.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);

  const data = await fetchJson(nearbyUrl);
  const picks = (data.results || []).slice(0, 3); // 2-3 options

  // Enrich details to get website + formatted address
  const out = [];
  for (const r of picks){
    const det = await placeDetails(r.place_id);
    const addr = det?.result?.formatted_address || r.vicinity || "";
    const website = det?.result?.website || "";
    const dist = haversine(lat, lng, r.geometry.location.lat, r.geometry.location.lng);
    out.push({
      name: r.name,
      address: addr,
      distance: +dist.toFixed(2),
      mapUrl: `https://www.google.com/maps/place/?q=place_id:${r.place_id}`,
      url: website
    });
  }
  return out;
}

// Nearby "points" like attractions, bars, cafes
async function searchNearby(lat, lng, radius, types){
  const out = [];
  for (const t of types){
    const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("type", t);
    url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);
    const data = await fetchJson(url);
    const picks = (data.results || []).slice(0, 1); // 1 per type to keep simple
    for (const r of picks){
      const det = await placeDetails(r.place_id);
      const addr = det?.result?.formatted_address || r.vicinity || "";
      const website = det?.result?.website || "";
      const dist = haversine(lat, lng, r.geometry.location.lat, r.geometry.location.lng);
      out.push({
        name: r.name,
        address: addr,
        distance: +dist.toFixed(2),
        mapUrl: `https://www.google.com/maps/place/?q=place_id:${r.place_id}`,
        url: website
      });
    }
  }
  return out;
}

async function placeDetails(placeId){
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,geometry,formatted_address,website,place_id");
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);
  return await fetchJson(url);
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d)=>d*Math.PI/180;
  const R=3958.8;
  const dLat=toRad(lat2-lat1);
  const dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
