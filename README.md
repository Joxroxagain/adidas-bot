# Adidas Bruteforcer

Launches instances of puppeteer browsers to a specified url and notifies you when an adidas cart page is detected.

### Installing
Clone or download the repository

```
git clone https://github.com/Joxroxagain/adidas-bruteforcer.git
```
Navigate to the folder to which you downloaded the files.

If you want to use the google login feature, use the chrome extension EditThisCookie to export your google cookies as JSON and enter the output into the file ```cookies.json```

Edit the config file as you wish.

Then run the following commands to start:
```
npm install
npm start
```
### Features
- [x] Auto add to cart, via speified sizes or random sizes
- [x] Stock monitoring
- [x] Cart page detection and notification system
- [x] Google cookie import for captcha prevention
- [x] Headless mode
- [x] Detection prevention
- [x] Random user-agent
- [x] Autofill via profiles (chrome autofill imported from your bvrowser)
- [x] Delay between browser launches
- [x] Proxies, imported by proxies.txt file in `IP:PORT` format
- [x] Captcha detection

### TODO
- [ ] Captcha harvesting?
- [ ] Scheduled release refresh
- [ ] Support for regions besides US
- [ ] Documentation for seting up autofill and profiles

## Credits
[<b>bequadro</b>](https://github.com/bequadro/kju) for some code

## Contributing
Contact me via 
- [x] email: jox.rox.js@gmail.com
- [x] discord: SoFloJoe#4498

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
