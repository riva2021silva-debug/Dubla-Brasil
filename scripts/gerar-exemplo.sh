#!/bin/bash
# Gera a cena de exemplo original do Dubla Brasil (vídeo, áudio original e trilha de fundo).
set -e
OUT="$(dirname "$0")/../public/exemplos/capivara-tucano"
mkdir -p "$OUT"
FONTE=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
D=20
# falas: inicio fim personagem(0=Capivara,1=Tucano)
FALAS="1.0 3.2 0;3.8 6.2 1;6.8 9.4 0;10.0 12.6 1;13.2 16.0 0;16.6 18.6 1"

# Música original: baixo + acordes (Dó - Lá menor - Fá - Sol) com batida leve.
MUSICA="0.18*sin(2*PI*t*(if(lt(mod(t,8),2),65.4,if(lt(mod(t,8),4),55,if(lt(mod(t,8),6),43.65,49)))))*(0.6+0.4*exp(-6*mod(t,0.5)))\
+0.05*sin(2*PI*t*(if(lt(mod(t,8),2),261.6,if(lt(mod(t,8),4),220,if(lt(mod(t,8),6),174.6,196)))))\
+0.04*sin(2*PI*t*(if(lt(mod(t,8),2),329.6,if(lt(mod(t,8),4),261.6,if(lt(mod(t,8),6),220,246.9)))))\
+0.035*sin(2*PI*t*(if(lt(mod(t,8),2),392,if(lt(mod(t,8),4),329.6,if(lt(mod(t,8),6),261.6,293.7)))))\
+0.06*sin(2*PI*900*t)*exp(-40*mod(t+0.25,0.5))*lt(mod(t+0.25,0.5),0.1)"

# Vozes de robô: sílabas moduladas, uma voz grave (Capivara) e uma aguda (Tucano).
VOZ=""
IFS=';' read -ra LS <<< "$FALAS"
for l in "${LS[@]}"; do
  read -r a b p <<< "$l"
  if [ "$p" = 0 ]; then f=150; else f=330; fi
  VOZ="$VOZ+between(t,$a,$b)*0.32*sin(2*PI*$f*t*(1+0.15*sin(2*PI*2.3*t)))*pow(0.5+0.5*sin(2*PI*5.5*(t-$a)),2)"
done

ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=exprs='$MUSICA':s=44100:d=$D" -c:a aac -b:a 160k "$OUT/fundo.m4a"

# Destaques de quem fala.
REALCE=""
for l in "${LS[@]}"; do
  read -r a b p <<< "$l"
  if [ "$p" = 0 ]; then x=200; else x=780; fi
  REALCE="$REALCE,drawbox=x=$((x-12)):y=188:w=324:h=324:color=0xfacc15@0.9:t=12:enable='between(t,$a,$b)'"
done

ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=0x0b3d2e:s=1280x720:d=$D:r=30" \
  -f lavfi -i "aevalsrc=exprs='$MUSICA$VOZ':s=44100:d=$D" \
  -filter_complex "[0:v]drawbox=x=0:y=600:w=1280:h=120:color=0x062018@1:t=fill,\
drawbox=x=200:y=200:w=300:h=300:color=0x8b5a2b@1:t=fill,\
drawbox=x=780:y=200:w=300:h=300:color=0x1d4ed8@1:t=fill,\
drawbox=x=250:y=280:w=50:h=50:color=black@1:t=fill,drawbox=x=400:y=280:w=50:h=50:color=black@1:t=fill,\
drawbox=x=830:y=280:w=50:h=50:color=white@1:t=fill,drawbox=x=980:y=280:w=50:h=50:color=white@1:t=fill,\
drawbox=x=880:y=380:w=120:h=50:color=0xf97316@1:t=fill\
$REALCE,\
drawtext=fontfile=$FONTE:text='CAPIVARA':fontcolor=white:fontsize=40:x=350-text_w/2:y=530,\
drawtext=fontfile=$FONTE:text='TUCANO':fontcolor=white:fontsize=40:x=930-text_w/2:y=530,\
drawtext=fontfile=$FONTE:text='DUBLA BRASIL • cena de exemplo':fontcolor=0xfacc15:fontsize=30:x=(w-text_w)/2:y=60[v]" \
  -map "[v]" -map 1:a -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 26 -c:a aac -b:a 160k -movflags +faststart -shortest \
  "$OUT/video.mp4"

ffmpeg -y -loglevel error -ss 7 -i "$OUT/video.mp4" -frames:v 1 -vf scale=480:-1 "$OUT/capa.jpg"
ls -la "$OUT"
