import { detectAdblock } from 'decoy-duck';

const result = await detectAdblock({ thirdParty: false, timeout: 4000 });
document.documentElement.dataset.result = JSON.stringify(result);
document.documentElement.dataset.ready = '1';
