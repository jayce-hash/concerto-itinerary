(() => {
  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);
  const screens = {
    welcome: byId('screen-welcome'),
    form: byId('screen-form'),
    loading: byId('screen-loading'),
    results: byId('screen-results')
  };

  // State
  let step = 0;
  const steps = ["show", "prefs"];
  
  // Helper to build function URLs safely
  const API_BASE = (window.CONCERTO_API_BASE || "").replace(/\/+$/,"");
  const fn = (name, qs="") => `${API_BASE}/.netlify/functions/${name}${qs ? (qs.startsWith("?")?qs:"?"+qs) : ""}`;

  
  // Helper to build function URLs safely
  const API_BASE = (window.CONCERTO_API_BASE || "").replace(/\/+$/,"");
  const api = (name, qs="") => API_BASE + "/.netlify/functions/" + name + (qs ? (qs.startsWith("?")?qs:"?"+qs) : "");

  const state = {
    artist: "", venue: "", venuePlaceId: "", venueLat: null, venueLng: null,
    eatWhen: "before", foodStyle: "", budget: "$$", hotel: ""
  };

  // Start
  byId('btn-start').addEventListener('click', () => {
    showScreen('form'); renderStep();
  });
  byId('btn-prev').addEventListener('click', () => {
    if (step>0){ step--; renderStep(); }
  });
  byId('btn-next').addEventListener('click', async () => {
    if (steps[step] === "show") {
      // If user typed a venue but didn't click a suggestion, resolve via Text Search
      await ensureVenueResolved();
    }
    if (step < steps.length-1){ step++; renderStep(); }
    else { await generate(); }
  });
  byId('btn-edit').addEventListener('click', () => {
    showScreen('form'); step = 0; renderStep();
  });
  byId('btn-new').addEventListener('click', () => { location.href = location.pathname; });

  // Share link
  byId('btn-share').addEventListener('click', async () => {
    const enc = btoa(encodeURIComponent(JSON.stringify(state)));
    const url = `${location.origin}${location.pathname}?a=${enc}`;
    try{ await navigator.clipboard.writeText(url); alert("Link copied!"); }
    catch{ prompt("Copy link:", url); }
  });

  // Restore from ?a=
  try {
    const enc = new URLSearchParams(location.search).get("a");
    if (enc) {
      const parsed = JSON.parse(decodeURIComponent(atob(enc)));
      Object.assign(state, parsed);
      showScreen('form'); step = 1; renderStep();
    }
  } catch {}

  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function setProgress(){
    const pct = ((step) / (steps.length)) * 100;
    byId('progress-bar').style.width = `${pct}%`;
  }

  function renderStep(){
    setProgress();
    const wrap = byId('step-wrapper');
    if (steps[step] === "show") {
      wrap.innerHTML = `
        <h3 class="step-title">Your Show</h3>
        <p class="step-help">Pick the artist and venue. Venue suggestions appear as you type.</p>
        <div class="form-grid">
          <div>
            <label>Artist</label>
            <div class="suggest">
              <input id="artist" type="text" placeholder="e.g., Taylor Swift" value="${escape(state.artist)}" autocomplete="off"/>
              <div id="artist-list" class="suggest-list" style="display:none;"></div>
            </div>
          </div>
          <div>
            <label>Venue</label>
            <div class="suggest">
              <input id="venue" type="text" placeholder="Type a venue name" value="${escape(state.venue)}" autocomplete="off"/>
              <div id="venue-list" class="suggest-list" style="display:none;"></div>
            </div>
            <div class="tiny">Tip: Press Enter to accept the top suggestion.</div>
          </div>
        </div>
      `;
      attachArtistSuggest();
      attachVenueSuggest();
      byId('btn-prev').disabled = true;
      byId('btn-next').textContent = "Next";
    } else {
      wrap.innerHTML = `
        <h3 class="step-title">Your Preferences</h3>
        <p class="step-help">We’ll tailor food and nearby picks around the venue.</p>
        <div class="form-grid two">
          <div>
            <label>Eat before or after?</label>
            <select id="eatWhen">
              <option value="before"${state.eatWhen==="before"?" selected":""}>Before</option>
              <option value="after"${state.eatWhen==="after"?" selected":""}>After</option>
              <option value="both"${state.eatWhen==="both"?" selected":""}>Both</option>
            </select>
          </div>
          <div>
            <label>Food style (optional)</label>
            <input id="foodStyle" type="text" placeholder="sushi, tacos, steak, vegan" value="${escape(state.foodStyle)}" />
          </div>
          <div>
            <label>Budget</label>
            <div class="radio-group" id="budget-pills">
              ${["$","$$","$$$","$$$$"].map(b => `<div class="pill${b===state.budget?" active":""}" data-val="${b}">${b}</div>`).join("")}
            </div>
          </div>
          <div>
            <label>Hotel (optional)</label>
            <input id="hotel" type="text" placeholder="Name or address" value="${escape(state.hotel)}" />
          </div>
        </div>
      `;
      byId('btn-prev').disabled = false;
      byId('btn-next').textContent = "Generate Itinerary";

      // Bind fields
      byId('eatWhen').onchange = (e)=> state.eatWhen = e.target.value;
      byId('foodStyle').oninput = (e)=> state.foodStyle = e.target.value.trim();
      byId('hotel').oninput = (e)=> state.hotel = e.target.value.trim();
      byId('budget-pills').querySelectorAll('.pill').forEach(p => {
        p.onclick = () => {
          state.budget = p.dataset.val;
          byId('budget-pills').querySelectorAll('.pill').forEach(x=>x.classList.remove('active'));
          p.classList.add('active');
        };
      });
    }
  }

  // Artist suggest via iTunes
  function attachArtistSuggest(){
    const input = byId('artist');
    const list = byId('artist-list');
    input.addEventListener('input', async (e)=>{
      state.artist = input.value.trim();
      const q = input.value.trim();
      if (!q){ list.style.display = "none"; return; }
      const res = await fetch(`https://itunes.apple.com/search?entity=musicArtist&limit=6&term=${encodeURIComponent(q)}`);
      const data = await res.json();
      list.innerHTML = "";
      (data.results||[]).forEach((r, idx) => {
        const d = document.createElement('div');
        d.className = "suggest-item";
        d.textContent = r.artistName;
        d.onclick = () => { input.value = r.artistName; state.artist = r.artistName; list.style.display="none"; };
        if (idx===0) d.dataset.first = "1";
        list.appendChild(d);
      });
      list.style.display = (data.results||[]).length ? "block" : "none";
    }, { passive:true });
    input.addEventListener('keydown', (e)=>{
      if (e.key === "Enter"){
        const first = byId('artist-list')?.querySelector('[data-first="1"]');
        if (first){ e.preventDefault(); first.click(); }
      }
    });
  }

  // Venue suggest via serverless (Google Places)
  function attachVenueSuggest(){
    const input = byId('venue');
    const list = byId('venue-list');
    let t;
    input.addEventListener('input', ()=>{
      clearTimeout(t);
      state.venue = input.value.trim();
      const q = input.value.trim();
      if (!q){ list.style.display = "none"; return; }
      t = setTimeout(async ()=>{
        const res = await fetch(`"+fn('places')+"?type=autocomplete&input=${encodeURIComponent(q)}`);
        if (!res.ok){ list.style.display="none"; return; }
        const data = await res.json();
        list.innerHTML = "";
        (data.predictions||[]).forEach((p, idx) => {
          const d = document.createElement('div');
          d.className = "suggest-item";
          d.textContent = p.description;
          d.onclick = async () => {
            input.value = p.description;
            state.venue = p.description;
            state.venuePlaceId = p.place_id;
            list.style.display = "none";
            const det = await fetch(`"+fn('places')+"?type=details&place_id=${encodeURIComponent(p.place_id)}`).then(r=>r.json());
            state.venueLat = det?.result?.geometry?.location?.lat || null;
            state.venueLng = det?.result?.geometry?.location?.lng || null;
          };
          if (idx===0) d.dataset.first = "1";
          list.appendChild(d);
        });
        list.style.display = (data.predictions||[]).length ? "block" : "none";
      }, 220);
    }, { passive:true });

    // Press Enter to accept top suggestion
    input.addEventListener('keydown', (e)=>{
      if (e.key === "Enter"){
        const first = byId('venue-list')?.querySelector('[data-first="1"]');
        if (first){ e.preventDefault(); first.click(); }
      }
    });
  }

  // If user didn't click a suggestion, resolve via Text Search
  async function ensureVenueResolved(){
    if (state.venuePlaceId && state.venueLat && state.venueLng) return;
    const q = (state.venue||"").trim();
    if (!q) return;
    const data = await fetch(`"+fn('places')+"?type=textsearch&query=${encodeURIComponent(q)}`).then(r=>r.json());
    const first = data?.results?.[0];
    if (first){
      state.venuePlaceId = first.place_id;
      state.venue = first.name;
      state.venueLat = first.geometry?.location?.lat || null;
      state.venueLng = first.geometry?.location?.lng || null;
    }
  }

  async function generate(){
    if (!state.artist || !state.venue || !state.venueLat || !state.venueLng){
      alert("Please select a venue (press Enter to accept the top suggestion), or type the venue and press Next so we can auto-resolve it.");
      return;
    }
    showScreen('loading');

    try {
      const res = await fetch(""+fn('itinerary')+"", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state)
      });
      const plan = await res.json().catch(()=>({}));
      renderResults(plan);
    } catch (e){
      renderResults(fallbackPlan());
    }
  }

  function renderResults(plan){
    byId('results-context').textContent = `${state.artist} at ${state.venue}`;
    const grid = byId('itinerary');
    const cards = [];

    if (plan.show){
      cards.push(card("Show", plan.show.title || `${state.artist} — Live`, [plan.show.venue || state.venue, plan.show.time || "Doors 6:30 · Show 8:00"], [
        link(plan.show.ticketUrl, "Tickets")
      ]));
    }
    if (Array.isArray(plan.diningBefore) && plan.diningBefore.length){
      cards.push(card("Eat Before", null, plan.diningBefore.map(placeLine)));
    }
    if (Array.isArray(plan.diningAfter) && plan.diningAfter.length){
      cards.push(card("Eat After", null, plan.diningAfter.map(placeLine)));
    }
    if (Array.isArray(plan.nearby) && plan.nearby.length){
      cards.push(card("Nearby Spots", null, plan.nearby.map(placeLine)));
    }
    if (plan.hotel){
      cards.push(card("Hotel", plan.hotel.name, [
        plan.hotel.address, badgeDistance(plan.hotel.distance)
      ], [link(plan.hotel.mapUrl, "Map")]));
    }
    grid.innerHTML = cards.join("");
    showScreen('results');
  }

  function card(title, subtitle, lines, actions=[]){
    const head = `<header><h3>${escape(title)}${subtitle?": "+escape(subtitle):""}</h3></header>`;
    const body = `<div class="body">${lines.map(l=>`<div>${l}</div>`).join("")}</div>`;
    const act = actions.length ? `<div class="actions">${actions.join(" ")}</div>` : "";
    return `<article class="card card-itin">${head}${body}${act}</article>`;
  }

  function placeLine(p){
    const bits = [
      `<strong>${escape(p.name||"")}</strong>`,
      escape(p.address||""),
      badgeDistance(p.distance),
      link(p.mapUrl, "Map"),
      link(p.url, "Website")
    ].filter(Boolean);
    return bits.join(" · ");
  }
  function link(u,t){ return u ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : ""; }
  function badgeDistance(m){ return m ? `<span class="meta">${(m.toFixed?m.toFixed(1):m)} mi</span>` : ""; }
  function escape(s){ return (s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m])); }
  function fallbackPlan(){
    return {
      show:{ title:`${state.artist} — Live`, venue: state.venue },
      diningBefore:[{name:"Local Bistro", address:"123 Main St", distance:0.4, mapUrl:"https://maps.google.com"}],
      diningAfter:[{name:"Night Owl Diner", address:"88 Market St", distance:0.5, mapUrl:"https://maps.google.com"}],
      nearby:[{name:"Record Store", address:"12 Vinyl Ln", distance:0.3, mapUrl:"https://maps.google.com"}]
    };
  }
})();