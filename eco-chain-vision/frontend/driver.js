document.addEventListener('DOMContentLoaded', () => {
    // --- IMPORTANT --- 
    // REPLACE WITH YOUR MAPBOX ACCESS TOKEN
    const MAPBOX_ACCESS_TOKEN = 'YOUR_MAPBOX_ACCESS_TOKEN_HERE';

    const API_URL = 'http://localhost:5001/api';
    const SOCKET_URL = 'http://localhost:5001';

    const alertsContainer = document.getElementById('alerts-container');
    const noAlertsMessage = document.getElementById('no-alerts-message');

    let map;
    let directions;
    const markers = {}; // To store marker instances by binId

    // --- Initialization ---
    function initialize() {
        if (!MAPBOX_ACCESS_TOKEN || MAPBOX_ACCESS_TOKEN === 'YOUR_MAPBOX_ACCESS_TOKEN_HERE') {
            alert('Please add your Mapbox Access Token in driver.js');
            return;
        }
        initMap();
        fetchInitialBins();
        initSocket();
    }

    // FE2-2: Initialize Map & Markers
    function initMap() {
        mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/dark-v10', // PRD specified dark theme
            center: [-98.5795, 39.8283], // Center of the US
            zoom: 3.5
        });

        // FE2-6: Initialize Optimized Routing
        directions = new MapboxDirections({
            accessToken: mapboxgl.accessToken,
            unit: 'metric',
            profile: 'mapbox/driving',
            controls: { instructions: false },
        });
        // Note: We are not adding the directions control to the map UI by default
        // to keep the interface clean. We will trigger it programmatically.
    }

    // FE2-3: Initialize WebSocket Connection
    function initSocket() {
        const socket = io(SOCKET_URL);
        socket.on('connect', () => console.log('Connected to WebSocket server.'));
        
        // FE2-4: Listen for Real-time Map Updates
        socket.on('binStatusChange', (updatedBin) => {
            console.log('Received bin status update:', updatedBin);
            addOrUpdateMarker(updatedBin);
            addOrUpdateAlert(updatedBin);
        });
    }

    // --- Data & UI Functions ---
    async function fetchInitialBins() {
        try {
            const response = await fetch(`${API_URL}/bins`);
            const bins = await response.json();
            bins.forEach(bin => {
                addOrUpdateMarker(bin);
                addOrUpdateAlert(bin);
            });
        } catch (error) {
            console.error('Error fetching initial bins:', error);
        }
    }

    function addOrUpdateMarker(bin) {
        const el = document.createElement('div');
        el.className = `marker marker-${bin.status}`;

        if (markers[bin.binId]) { // Marker exists, just update it
            markers[bin.binId].getElement().className = el.className;
        } else { // Marker is new, create it
            const marker = new mapboxgl.Marker(el)
                .setLngLat(bin.location.coordinates)
                .addTo(map);
            marker.getElement().addEventListener('click', () => getRoute(bin));
            markers[bin.binId] = marker;
        }
    }

    // FE2-5: Manage Live Alert Panel
    function addOrUpdateAlert(bin) {
        const existingAlert = document.getElementById(`alert-${bin.binId}`);

        if (bin.status === 'full') {
            if (existingAlert) return; // Alert already shown

            noAlertsMessage.style.display = 'none';
            const card = createAlertCard(bin);
            alertsContainer.prepend(card);
            // Make it visible with an animation
            setTimeout(() => card.classList.add('visible'), 50);

        } else { // Not full, remove alert if it exists
            if (existingAlert) {
                existingAlert.classList.remove('visible');
                setTimeout(() => existingAlert.remove(), 300);
            }
            // Check if any alerts are left
            if (alertsContainer.childElementCount <= 1) {
                noAlertsMessage.style.display = 'block';
            }
        }
    }

    function createAlertCard(bin) {
        const card = document.createElement('div');
        card.id = `alert-${bin.binId}`;
        card.className = 'alert-card bg-white/5 border border-white/10 rounded-lg p-4 shadow-lg cursor-pointer';
        
        const wasteItems = Object.entries(bin.wasteCounts || {}).map(([type, count]) => `${type}: ${count}`).join(', ');

        card.innerHTML = `
            <div class="flex items-center mb-2">
                <svg class="w-6 h-6 text-red-500 mr-3 pulse-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <h3 class="text-xl font-bold text-red-400">${bin.binId}</h3>
            </div>
            <p class="text-sm text-gray-400 ml-9">Items: ${bin.totalItems}/${bin.capacity}</p>
            <p class="text-sm text-gray-400 ml-9 truncate">Counts: ${wasteItems}</p>
            <div class="mt-4 flex justify-end">
                <button class="empty-btn bg-cyan-500/20 text-cyan-300 border border-cyan-500 px-3 py-1 rounded-md text-sm hover:bg-cyan-500/40">Acknowledge & Empty</button>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('empty-btn')) {
                getRoute(bin);
            }
        });
        
        // FE2-7: "Empty Bin" Workflow
        card.querySelector('.empty-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const response = await fetch(`${API_URL}/bins/${bin.binId}/empty`, { method: 'POST' });
                if (!response.ok) throw new Error('Failed to empty bin');
                // The server will emit a websocket event which will trigger the UI update.
                // No need for manual removal here.
            } catch (error) {
                console.error('Error emptying bin:', error);
            }
        });

        return card;
    }

    // FE2-6: Get Optimized Route
    function getRoute(bin) {
        // Use the browser's geolocation to get the driver's current position
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            const start = [longitude, latitude];
            const end = bin.location.coordinates;

            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;
            const response = await fetch(url);
            const data = await response.json();
            const route = data.routes[0].geometry.coordinates;

            if (map.getSource('route')) {
                map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: route } });
            } else {
                map.addLayer({
                    id: 'route',
                    type: 'line',
                    source: { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route } } },
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#22d3ee', 'line-width': 5, 'line-opacity': 0.8 }
                });
            }

            // Fly to the route
            const bounds = new mapboxgl.LngLatBounds(start, end);
            map.fitBounds(bounds, { padding: 100 });

        }, (error) => {
            console.error("Could not get current location for routing", error);
            alert("Please allow location access to calculate the route.");
        });
    }

    initialize();
});
