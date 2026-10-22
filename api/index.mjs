import {createApiHandler} from '../server/api.mjs';
import {createCloudServices} from '../server/cloud-services.mjs';
let services;
export const createServerlessHandler = (getServices=()=>services??=createCloudServices(process.env)) => createApiHandler({getServices,cloud:true});
export default createServerlessHandler();
