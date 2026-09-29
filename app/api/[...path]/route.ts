import {runVisitorDemo, visitorScope, withDemoScope, overlayDemo, freshDemo} from '../../../lib/demo-session';
import {ensureSeed,runtimeEnv} from '../../../lib/db';
import {getBootstrap} from '../../../lib/league';
import {adminState,saveRecord,undoChange,resetDemo,submitEnquiry} from '../../../lib/admin-service';
import {login,logout,requireAdmin,assertSameOrigin} from '../../../lib/auth';
import {demoState,startDemo,receiveMessage,releaseDemo,acknowledgePresentation} from '../../../lib/agent';
import {AppError} from '../../../lib/types';
import {handleMcp} from '../../../lib/mcp';

const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function route(request:Request){
 try{
  if(new URL(request.url).pathname==='/api/mcp')return await handleMcp(request);
  await ensureSeed();
  const path=new URL(request.url).pathname.slice(5),post=request.method==='POST';
  if(Number(request.headers.get('content-length')??0)>6_000_000)throw new AppError('This upload is too large.',413);
  if(path==='bootstrap'&&!post){const scope=await visitorScope(request);return json(scope?await withDemoScope(scope,()=>getBootstrap()):overlayDemo(await getBootstrap(),freshDemo()));}
  if(path==='contact'&&post){assertSameOrigin(request);return json(await submitEnquiry(await request.json(),request.headers.get('cf-connecting-ip')??'local'))}
  if(path==='demo/state'&&!post)return json(await visitorScope(request)?await runVisitorDemo(request,demoState,'read'):{messages:[],events:[],active:false,owner:false,busy:false,configured:!!runtimeEnv().OPENAI_API_KEY});
  if(path==='demo/start'&&post)return json(await runVisitorDemo(request,startDemo,'start'));
  if(path==='demo/reset'&&post)return json(await runVisitorDemo(request,startDemo,'reset'));
  if(path==='demo/present'&&post)return json(await runVisitorDemo(request,acknowledgePresentation));
  if(path==='demo/message'&&post)return json(await runVisitorDemo(request,receiveMessage));
  if(path==='demo/release'&&post)return json(await runVisitorDemo(request,releaseDemo));
  if(path==='admin/login'&&post)return await login(request);
  if(path==='admin/logout'&&post)return await logout(request);
  if(path.startsWith('admin/')){
   await requireAdmin(request);
   if(path==='admin/state'&&!post)return json(await adminState());
   if(path==='admin/export'&&!post)return new Response(JSON.stringify(await adminState(),null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="heavy-ballers-export.json"','Cache-Control':'no-store'}});
   if(path==='admin/save'&&post){const b=await request.json() as {kind:Parameters<typeof saveRecord>[0];record:unknown;expectedVersion?:number};return json(await saveRecord(b.kind,b.record,b.expectedVersion))}
   if(path==='admin/undo'&&post){const b=await request.json() as {id:string};return json(await undoChange(b.id))}
   if(path==='admin/reset'&&post)return json(await resetDemo());
   if(path==='admin/upload'&&post){
    const file=(await request.formData()).get('file');if(!(file instanceof File)||file.size>5_000_000||file.size===0)throw new AppError('Choose a photograph smaller than 5 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
    if(!png&&!jpg&&!webp)throw new AppError('Use a PNG, JPEG or WebP photograph.');
    const bucket=runtimeEnv().BUCKET as R2Bucket|undefined;if(!bucket)throw new AppError('Photo storage is unavailable.',503);
    const ext=png?'png':jpg?'jpg':'webp',key=crypto.randomUUID()+'.'+ext;
    await bucket.put(key,bytes,{httpMetadata:{contentType:png?'image/png':jpg?'image/jpeg':'image/webp'}});
    return json({url:'/api/media/'+key});
   }
  }
  if(path.startsWith('media/')&&!post){
   const key=path.slice(6);if(!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key))throw new AppError('Photo not found.',404);
   const item=await (runtimeEnv().BUCKET as R2Bucket).get(key);if(!item)throw new AppError('Photo not found.',404);
   return new Response(item.body,{headers:{'Content-Type':item.httpMetadata?.contentType??'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
  }
  throw new AppError('Page not found.',404);
 }catch(e){const known=e instanceof AppError;if(!known)console.error('API failure',e instanceof Error?e.message:'Unknown error');return Response.json({error:known?e.message:'Something went wrong. Please try again.',code:known?e.code:'INTERNAL_ERROR'},{status:known?e.status:500,headers:{'Cache-Control':'no-store'}})}
}
export const GET=route;export const POST=route;
