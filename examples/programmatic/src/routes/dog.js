import { animalAPI } from "../utils";

export default (req, res) =>
  animalAPI(res, "Dog", "https://random.dog/woof.json", "url");
