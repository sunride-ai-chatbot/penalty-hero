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

def blast(d,f0=2380.0,seed=0):
    """a pea whistle: two close cavity tones that beat, a pea that rattles the pitch and the level ~34 times a second, breath noise on top"""
    t=t_(d);r=np.random.default_rng(seed)
    bend=1+0.012*np.exp(-t/0.06)-0.012*np.clip((t-(d-0.12))/0.12,0,1)                    # the pitch leaps up at the start and sags at the end
    wob=1+0.004*np.sin(2*np.pi*34*t+r.uniform(0,6))+0.002*np.sin(2*np.pi*11*t+r.uniform(0,6))
    ph=np.cumsum(2*np.pi*f0*bend*wob/SR)
    tone=np.sin(ph)+0.25*np.sin(ph*1.012+0.7)+0.10*np.sin(2*ph+0.4)
    am=1+0.07*np.sin(2*np.pi*34*t+1.1)
    breath=band(noise(len(t)),1400,4200)*0.05
    x=(tone*am)*(0.9+0.1*np.sin(2*np.pi*2.2*t))+breath
    return low(ease(x,0.03,0.12),4300,2)   # no sharp edge on either side, and nothing above the whistle's own note
def open_air(x,tail=1.1,wet=0.26):
    n=int(SR*tail);ir=noise(n)*np.exp(-np.arange(n)/SR/0.28);ir=low(ir,5200);ir[:int(SR*0.012)]*=0;ir=ir/np.sqrt(np.sum(ir**2))
    y=signal.fftconvolve(x,ir)[:len(x)+n];x=np.pad(x,(0,len(y)-len(x)));return x*(1-wet)+y*wet*1.6
def whistle():
    x=blast(0.46)
    return norm(open_air(np.pad(x,(0,int(SR*0.4))),wet=0.32),-15)
def whistle_final():
    gap=lambda d:np.zeros(int(SR*d))
    x=np.concatenate([blast(0.3,seed=1),gap(0.18),blast(0.62,2400,seed=3),gap(0.5)])
    return norm(open_air(x,wet=0.32),-15)
def kick():
    t=t_(0.4)
    thud=np.sin(np.cumsum(2*np.pi*(52+78*np.exp(-t/0.028))/SR))*np.exp(-t/0.075)
    body=np.sin(2*np.pi*205*t)*np.exp(-t/0.035)*0.28+np.sin(2*np.pi*340*t)*np.exp(-t/0.02)*0.12
    slap=band(noise(len(t)),300,1500)*np.exp(-t/0.012)*0.8
    click=band(noise(len(t)),1500,3200)*np.exp(-t/0.003)*0.18
    x=low(np.tanh(1.2*(thud*1.15+body+slap*0.8+click)),4200,2);x[:int(SR*0.0004)]*=np.linspace(0,1,int(SR*0.0004))
    return norm(x,-8)
def net():
    t=t_(1.0);fl=0.55+0.45*np.abs(np.sin(2*np.pi*9.5*t+0.5))*np.exp(-t/0.5)
    x=band(noise(len(t)),500,2400)*np.exp(-t/0.2)*fl
    for k in range(34):                                                               # strands knocking against each other
        s=int(rng.uniform(0.01,0.55)*SR);m=int(SR*0.002);x[s:s+m]+=band(noise(m+40),1200,3000)[:m]*rng.uniform(.1,.3)
    x+=low(noise(len(t)),420)*np.exp(-t/0.09)*0.7
    return norm(low(ease(x,0.012,0.15),3200,2),-17)
def post():
    t=t_(1.3);x=np.zeros(len(t))
    for f,dk,a in [(420,.5,1.0),(1130,.3,.45),(2160,.16,.16)]:
        x+=a*np.exp(-t/dk)*(np.sin(2*np.pi*f*t)+0.7*np.sin(2*np.pi*(f+3.4)*t+1))
    x+=band(noise(len(t)),400,2800)*np.exp(-t/0.008)*0.6+np.sin(2*np.pi*150*t)*np.exp(-t/0.06)*0.8
    return norm(low(ease(x,0.002,0.2),3800,2),-13)
def glove():
    t=t_(0.3)
    x=band(noise(len(t)),200,1100)*np.exp(-t/0.024)+np.sin(2*np.pi*120*t)*np.exp(-t/0.055)*0.7
    return norm(low(np.tanh(1.1*x),3000,2),-10)
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
