echo node_modules > .gitignore
echo .env >> .gitignore
"C:\Program Files\Git\cmd\git.exe" init
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "Initial commit for YetiThumbs bot"
"C:\Program Files\Git\cmd\git.exe" branch -M main
"C:\Program Files\Git\cmd\git.exe" remote add origin https://github.com/f1nn2010/YetiThumbs-bot.git
"C:\Program Files\Git\cmd\git.exe" push -u origin main
