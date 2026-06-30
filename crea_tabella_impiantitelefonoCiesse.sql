CREATE TABLE `impiantitelefonoCiesse` (
  `id` int(255) NOT NULL AUTO_INCREMENT,
  `idimpianto` int(255) NOT NULL,
  `telefono` varchar(255) NOT NULL,
  `nome` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1;