// netlify/functions/places.js
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }
  const params = event.queryStringParameters || {};
  const type = params.type || "autocomplete";

  try {
    let url;
    if (type === "autocomplete") {
      const input = params.input || "";
      url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      // Allow stadiums/arenas by not over-restricting type; establishment works broadly
      url.searchParams.set("types", "establishment");
      url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);
    } else if (type === "details") {
      const placeId = params.place_id;
      url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("fields", "name,geometry,formatted_address,website,place_id");
      url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);
    } else if (type === "textsearch") {
      const query = params.query || "";
      url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
      url.searchParams.set("query", query);
      url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);
    } else {
      return { statusCode: 400, headers: cors(), body: "Bad type" };
    }

    const res = await fetch(url.toString());
    const data = await res.json();
    return { statusCode: 200, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: "Server error" };
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  };
}
