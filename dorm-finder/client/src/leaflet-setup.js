// Fix default Leaflet marker icons in bundlers (Vite)
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// @ts-ignore: file packages exist in node_modules
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon1x from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";

// Reset the default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: icon2x,
  iconUrl: icon1x,
  shadowUrl: shadow,
  iconSize: [22, 36],
  iconAnchor: [11, 36],
  shadowSize: [36, 36],
  shadowAnchor: [11, 36],
  popupAnchor: [1, -30],
});

export default L;
