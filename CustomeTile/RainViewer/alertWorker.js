// alertWorker.js
// Import Turf.js inside the worker
importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');

self.onmessage = function(e) {
  const { feature, tolerance } = e.data;
  // Simplify the feature using Turf.js
  const simplifiedFeature = turf.simplify(feature, { tolerance: tolerance || 0.01, highQuality: false });
  // Post the simplified feature back to the main thread
  self.postMessage({ id: feature.id, simplifiedFeature });
};
