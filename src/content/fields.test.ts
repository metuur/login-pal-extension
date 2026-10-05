import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { inspectFields, fillFields } from './fields';
import type { LoginProfile } from '../shared/types';
const profile: LoginProfile={id:'qa',revision:1,approvedCatalogRuleRevision:1,name:'QA',login:{origin:'https://qa.example.test',pathname:'/login',hash:''},usernameSelector:'#user',passwordSelector:'#pass',success:{kind:'url',route:{origin:'https://qa.example.test',pathname:'/dashboard',hash:''}}};
function fixture(html='<form><input id="user"><input id="pass" type="password"><button>Login</button></form>') {
 const dom=new JSDOM(html,{url:'https://qa.example.test/login'});
 Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value(){return this.hidden?[]:[{width:100,height:20}]}});
 return dom;
}
describe('validated credential delivery',()=>{
 it('rejects missing, ambiguous, hidden and cross-origin fields before writing',()=>{
  for(const html of ['<input id="user">','<input id="user"><input id="user"><input id="pass" type="password">','<input id="user"><input hidden id="pass" type="password">','<form action="https://other.test"><input id="user"><input id="pass" type="password"></form>']){
   const dom=fixture(html); expect(inspectFields(profile,dom.window.document).ok).toBe(false);dom.window.close();
  }
 });
 it('fills both native inputs without submitting and acknowledges no secrets',()=>{
  const dom=fixture();let submitted=false;dom.window.document.querySelector('form')!.addEventListener('submit',()=>submitted=true);
  const result=fillFields(profile,'synthetic-user','synthetic-value',dom.window.document);
  expect(result).toEqual({ok:true});expect(submitted).toBe(false);
  expect(dom.window.document.querySelector<HTMLInputElement>('#user')!.value==='synthetic-user').toBe(true);
  expect(dom.window.document.querySelector<HTMLInputElement>('#pass')!.value==='synthetic-value').toBe(true);dom.window.close();
 });
 it('preserves page changes and cleans up a partial fill',()=>{
  const dom=fixture(); const user=dom.window.document.querySelector<HTMLInputElement>('#user')!;const pass=dom.window.document.querySelector<HTMLInputElement>('#pass')!;
  pass.addEventListener('input',()=>{pass.value='page-change'});
  expect(fillFields(profile,'synthetic-user','synthetic-value',dom.window.document).ok).toBe(false);
  expect(user.value.length).toBe(0);expect(pass.value==='page-change').toBe(true);dom.window.close();
 });
 it('rejects lookalike and off-route documents',()=>{const dom=fixture();dom.reconfigure({url:'https://qa.example.test/unrelated'});expect(inspectFields(profile,dom.window.document).ok).toBe(false);dom.window.close()});
 it('recognizes an already visible configured success marker',()=>{const dom=fixture('<input id="user"><input id="pass" type="password"><div id="success">Ready</div>');const p={...profile,success:{kind:'element' as const,route:profile.login,selector:'#success'}};expect(inspectFields(p,dom.window.document).baseline).toBe(true);dom.window.close()});
});
