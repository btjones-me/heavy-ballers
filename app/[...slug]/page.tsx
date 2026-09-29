import SiteShell from '../../components/SiteShell';
import Admin from '../../components/Admin';
export default async function Page({params}:{params:Promise<{slug:string[]}>}){const {slug}=await params;const path='/'+slug.join('/');return slug[0]==='admin'?<Admin/>:<SiteShell initialPath={path}/>}
