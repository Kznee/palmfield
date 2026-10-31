// Bound every startup phase, and dispose camera streams that arrive after cancellation.
export function waitForStartup(promise,{signal,timeout,code,onLateResult}){
  return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    const fail=error=>{if(settled)return;settled=true;cleanup();reject(error);};
    const abort=()=>fail(new Error('startup-cancelled'));
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>fail(new Error(code)),timeout);
    Promise.resolve(promise).then(value=>{
      if(settled){onLateResult?.(value);return;}
      settled=true;cleanup();resolve(value);
    },fail);
    if(signal?.aborted)abort();
  });
}
