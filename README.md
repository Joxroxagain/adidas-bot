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
- [x] Cart cart page and notification system
- [x] Google cookie import for captcha prevention
- [x] Headless mode
- [x] Detection prevention
- [x] Random user-agent
- [x] Autofill

### TODO
- [ ] Auto add to cart
- [ ] Captcha harvesting?
- [ ] Scheduled release refresh
- [ ] Stock monitor

## Credits
[<b>bequadro</b>](https://github.com/bequadro/kju) for some code

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
