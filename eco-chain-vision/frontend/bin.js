document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('webcam');
    const detectionBox = document.getElementById('detection-box');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const plasticCount = document.getElementById('plastic-count');
    const paperCount = document.getElementById('paper-count');
    const organicCount = document.getElementById('organic-count');
    const otherCount = document.getElementById('other-count');
    const totalItemsCount = document.getElementById('total-items-count');

    const API_URL = 'http://localhost:5001/api';
    const BIN_ID = 'BIN-001'; // Static Bin ID for this prototype

    // AI-2: Map COCO-SSD classes to our waste categories
    const WASTE_MAP = {
        'bottle': 'plastic',
        'cup': 'plastic',
        'book': 'paper',
        'apple': 'organic',
        'banana': 'organic',
        'orange': 'organic',
        'bowl': 'other',
        'cell phone': 'other',
    };

    let model = null;
    let isDetecting = false; // Lock to prevent multiple simultaneous detections

    // --- UI Update Functions ---
    function updateCounters(bin) {
        plasticCount.textContent = bin.wasteCounts.plastic || 0;
        paperCount.textContent = bin.wasteCounts.paper || 0;
        organicCount.textContent = bin.wasteCounts.organic || 0;
        otherCount.textContent = bin.wasteCounts.other || 0;
        totalItemsCount.textContent = bin.totalItems || 0;
    }

    function updateStatus(bin) {
        statusText.textContent = `STATUS: ${bin.status.toUpperCase()}`;
        statusIndicator.className = `text-center mb-6 p-4 rounded-lg status-${bin.status}`;
    }

    // FE1-5: Detection Animation
    function flashBorder(wasteType) {
        const colorClass = `border-${wasteType}`;
        detectionBox.classList.add(colorClass, 'detection-flash');
        detectionBox.style.display = 'block';

        setTimeout(() => {
            detectionBox.classList.remove(colorClass, 'detection-flash');
            detectionBox.style.display = 'none';
        }, 500); // Animation lasts 500ms
    }

    // --- API Communication ---
    async function logWaste(wasteType) {
        try {
            const response = await fetch(`${API_URL}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ binId: BIN_ID, wasteType }),
            });
            if (!response.ok) throw new Error('Failed to log waste');
            const updatedBin = await response.json();
            
            // Update UI with response from server
            updateCounters(updatedBin);
            updateStatus(updatedBin);
            flashBorder(wasteType);

        } catch (error) {
            console.error('Error logging waste:', error);
        }
    }

    // --- AI Detection Logic ---
    async function runDetection() {
        if (isDetecting) return;
        isDetecting = true;

        try {
            const predictions = await model.detect(video);

            if (predictions.length > 0) {
                for (const prediction of predictions) {
                    // AI-4: Confidence Threshold
                    if (prediction.score > 0.60) {
                        const mappedClass = WASTE_MAP[prediction.class];
                        if (mappedClass) {
                            console.log(`Detected: ${prediction.class} -> ${mappedClass}`);
                            await logWaste(mappedClass);
                            // Stop after first valid detection to avoid spamming
                            break; 
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Detection error:", error);
        }

        isDetecting = false;
    }

    // --- Initialization ---
    async function initialize() {
        // FE1-2: Webcam Integration
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
        } catch (error) {
            console.error("Error accessing webcam:", error);
            alert("Could not access webcam. Please ensure it is enabled and permissions are granted.");
            return;
        }

        // AI-1: Load the model
        try {
            model = await cocoSsd.load();
            console.log('AI Model loaded.');
        } catch (error) {
            console.error("Error loading model:", error);
            alert("Could not load AI model.");
            return;
        }

        // Fetch initial state of the bin
        try {
            const res = await fetch(`${API_URL}/bins`);
            const bins = await res.json();
            const thisBin = bins.find(b => b.binId === BIN_ID);
            if (thisBin) {
                updateCounters(thisBin);
                updateStatus(thisBin);
            }
        } catch (error) {
            console.error("Could not fetch initial bin state:", error);
        }

        // AI-3: Real-time Detection Loop (throttled)
        setInterval(runDetection, 1500); // Run detection every 1.5 seconds
    }

    initialize();
});
