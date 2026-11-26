#!/usr/bin/env python3
"""Renders the match sound effects (referee whistle, boot on ball, net, post, gloves) into assets/audio/sfx-*.{opus,m4a}.
Everything is built from first principles with numpy/scipy, so there is nothing to license. Usage: python3 scripts/make-sfx.py
The crowd recordings (crowd-*.opus) are separate and untouched."""
import numpy as np, subprocess, os, sys
from scipy import signal
SR=44100; rng=np.random.default_rng(26)
OUT=os.path.join(os.path.dirname(__file__),'..','assets','audio')
t_=lambda d:np.arange(int(SR*d))/SR
def band(x,lo,hi,order=4):
    sos=signal.butter(order,[lo,hi],btype='band',fs=SR,output='sos');return signal.sosfilt(sos,x)
def high(x,f,order=4):return signal.sosfilt(signal.butter(order,f,btype='high',fs=SR,output='sos'),x)
def low(x,f,order=4):return signal.sosfilt(signal.butter(order,f,btype='low',fs=SR,output='sos'),x)
def noise(n):return rng.standard_normal(n)
def ease(x,a,r,sr=SR):
    n=len(x);e=np.ones(n);na=int(a*sr);nr=int(r*sr)
    e[:na]=np.sin(np.linspace(0,np.pi/2,na))**2;e[n-nr:]*=np.cos(np.linspace(0,np.pi/2,nr))**2;return x*e
def norm(x,peak_db):x=x-np.mean(x);return x/np.max(np.abs(x))*10**(peak_db/20)

def blast(d,f0=2870.0,seed=0):
    """a pea whistle: two close cavity tones that beat, a pea that rattles the pitch and the level ~34 times a second, breath noise on top"""
    t=t_(d);r=np.random.default_rng(seed)
    bend=1+0.028*np.exp(-t/0.05)-0.02*np.clip((t-(d-0.12))/0.12,0,1)                    # the pitch leaps up at the start and sags at the end
    wob=1+0.011*np.sin(2*np.pi*34*t+r.uniform(0,6))+0.004*np.sin(2*np.pi*11*t+r.uniform(0,6))
    ph=np.cumsum(2*np.pi*f0*bend*wob/SR)
    tone=np.sin(ph)+0.55*np.sin(ph*1.021+0.7)+0.30*np.sin(2*ph+0.4)+0.09*np.sin(3*ph)
    am=1+0.20*np.sin(2*np.pi*34*t+1.1)+0.07*np.sin(2*np.pi*53*t)
    breath=band(noise(len(t)),1800,6800)*(0.16+0.06*np.sin(2*np.pi*3*t))
    x=(tone*am)*(0.9+0.1*np.sin(2*np.pi*2.2*t))+breath
    return ease(x,0.012,0.07)
def open_air(x,tail=1.1,wet=0.26):
    n=int(SR*tail);ir=noise(n)*np.exp(-np.arange(n)/SR/0.28);ir=low(ir,5200);ir[:int(SR*0.012)]*=0;ir=ir/np.sqrt(np.sum(ir**2))
    y=signal.fftconvolve(x,ir)[:len(x)+n];x=np.pad(x,(0,len(y)-len(x)));return x*(1-wet)+y*wet*1.6
def whistle():
    x=blast(0.62)
    return norm(open_air(np.pad(x,(0,int(SR*0.5)))),-5)
def whistle_final():
    gap=lambda d:np.zeros(int(SR*d))
    x=np.concatenate([blast(0.24,seed=1),gap(0.13),blast(0.24,2850,seed=2),gap(0.13),blast(0.78,2890,seed=3),gap(0.6)])
    return norm(open_air(x),-5)
def kick():
    t=t_(0.4)
    thud=np.sin(np.cumsum(2*np.pi*(52+78*np.exp(-t/0.028))/SR))*np.exp(-t/0.075)
    body=np.sin(2*np.pi*205*t)*np.exp(-t/0.035)*0.28+np.sin(2*np.pi*340*t)*np.exp(-t/0.02)*0.12
    slap=band(noise(len(t)),550,2600)*np.exp(-t/0.011)*1.0
    click=high(noise(len(t)),3200)*np.exp(-t/0.0028)*0.55
    x=np.tanh(1.7*(thud*1.15+body+slap*0.9+click));x[:int(SR*0.0004)]*=np.linspace(0,1,int(SR*0.0004))
    return norm(x,-1.5)
def net():
    t=t_(1.0);fl=0.55+0.45*np.abs(np.sin(2*np.pi*9.5*t+0.5))*np.exp(-t/0.5)
    x=band(noise(len(t)),900,4200)*np.exp(-t/0.2)*fl
    for k in range(34):                                                               # strands knocking against each other
        s=int(rng.uniform(0.01,0.55)*SR);m=int(SR*0.002);x[s:s+m]+=high(noise(m+40),2500)[:m]*rng.uniform(.2,.6)
    x+=low(noise(len(t)),420)*np.exp(-t/0.09)*0.7
    return norm(ease(x,0.004,0.12),-5)
def post():
    t=t_(1.3);x=np.zeros(len(t))
    for f,dk,a in [(548,.55,1.0),(1490,.36,.62),(2910,.23,.34),(4930,.13,.2),(7150,.08,.1)]:
        x+=a*np.exp(-t/dk)*(np.sin(2*np.pi*f*t)+0.7*np.sin(2*np.pi*(f+3.4)*t+1))
    x+=band(noise(len(t)),1200,7000)*np.exp(-t/0.006)*0.9+np.sin(2*np.pi*176*t)*np.exp(-t/0.05)*0.7
    return norm(ease(x,0.0006,0.15),-2.5)
def glove():
    t=t_(0.3)
    x=band(noise(len(t)),280,1900)*np.exp(-t/0.022)+np.sin(2*np.pi*138*t)*np.exp(-t/0.05)*0.6+high(noise(len(t)),2400)*np.exp(-t/0.004)*0.3
    return norm(np.tanh(1.3*x),-3)
SFX={'whistle':whistle,'whistle-final':whistle_final,'kick':kick,'net':net,'post':post,'glove':glove}
def write(name,x):
    wav=f'/tmp/sfx-{name}.wav';import wave
    with wave.open(wav,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes())
    for ext,codec,br in (('opus','libopus','56k'),('m4a','aac','72k')):
        subprocess.run(['ffmpeg','-v','error','-y','-i',wav,'-c:a',codec,'-b:a',br,os.path.join(OUT,f'sfx-{name}.{ext}')],check=True)
    return wav
if __name__=='__main__':
    for n,f in SFX.items():
        w=write(n,f());print(n,'%.2fs'%(os.path.getsize(w)/2/SR),'peak',round(20*np.log10(np.abs(np.frombuffer(open(w,'rb').read()[44:],dtype='<i2')).max()/32767),1),'dB')
