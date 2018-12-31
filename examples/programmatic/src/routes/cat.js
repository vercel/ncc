import { animalAPI } from "../utils";

export default (req, res) =>
  animalAPI(res, "Cat", "https://aws.random.cat/meow", "file");
