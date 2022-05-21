const fs = require("fs");
const path = require('path');

async function main() {
  const contractsFilename = 'contracts.json';
  const { FRONTEND_CONTRACT_PATH } = process.env;
  
  console.log("Copy generated contracts json to frontend");
  
  fs.copyFile(
    path.join(__dirname, '..', 'dist', contractsFilename), 
    path.join(FRONTEND_CONTRACT_PATH, contractsFilename),
    (err) => {
      if(err) {
        throw err;
      } else {
        console.log(contractsFilename + " was copied to " + FRONTEND_CONTRACT_PATH);
      }
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });