import PublicSite from '../../components/PublicSite';
import Admin from '../../components/Admin';
import DemoPhone from '../../components/DemoPhone';
export default async function Page({params}:{params:Promise<{slug:string[]}>}){const {slug}=await params;const path='/'+slug.join('/');return slug[0]==='admin'?<Admin/>:<><PublicSite key={path} path={path}/><DemoPhone/></>}
