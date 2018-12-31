import { animalAPI } from "../utils";

export default (req, res) =>
  animalAPI(res, "Fox", "https://randomfox.ca/floof/", "image");
